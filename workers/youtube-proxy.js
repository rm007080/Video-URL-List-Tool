/**
 * YouTube List Tool - Enhanced Cloudflare Worker
 *
 * 含まれる機能:
 * - CORS Proxy（YouTube RSS専用）
 * - /resolve-channel: @handle → channelId 解決
 * - /fetch-videos: YouTube Data API v3 から段階的に動画一覧取得
 * - CORS 改善（Cloudflare Pages プレビュー対応）
 * - Durable Objects によるレート制限（RateLimiter）
 * - Cache API による 5 分キャッシュ（RSS/解決/動画取得）
 * - エラーハンドリング統一（日本語メッセージ + エラーコード）
 *
 * 注意:
 * - 既存のエンドポイントと構造を維持しつつ、新機能を統合しています。
 * - 依存: env.YT_API_KEY または env.YOUTUBE_API_KEY（いずれか必須）
 * - Durable Object: env.RATE_LIMITER にバインド済みであること（wrangler.toml）
 */

// 許可するオリジン（本番環境のURLに変更してください）
const ALLOWED_ORIGINS = [
  'http://localhost:8000',
  'http://localhost:3000',
  'http://127.0.0.1:8000',
  'https://youtubelisttool.pages.dev', // Cloudflare Pages 本番URL
];

// Cloudflare Pages のプレビューURLを許可（例: https://a1b2c3.youtubelisttool.pages.dev）
const PREVIEW_ORIGIN_REGEX = /^https:\/\/[a-z0-9-]+\.youtubelisttool\.pages\.dev$/i;

// YouTube RSS URLのパターン（ホワイトリスト方式）
const YOUTUBE_RSS_PATTERN = /^https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=UC[\w-]{22}$/;

// YouTube Data API ベースURL
const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

// タイムアウト等の定数
const DEFAULT_TIMEOUT_MS = 10000; // 既存RSSプロキシのデフォルト
const FETCH_VIDEOS_TIMEOUT_MS = 30000; // /fetch-videos の API 呼び出しタイムアウト
const MAX_PAGE_RESULTS = 50; // YouTube API の上限
const MAX_PAGES = 10; // 1リクエストあたりの最大ページ数
const CACHE_TTL_SECONDS = 300; // 5分キャッシュ
const USER_AGENT = 'YouTubeListTool-Worker/1.0 (+https://youtubelisttool.pages.dev)';

// エラーコードの定義（統一）
const ERROR_CODES = {
  QUOTA_EXCEEDED: 'quota_exceeded', // 403 - クォータ超過
  RATE_LIMITED: 'rate_limited', // 429 - レート制限（Durable Object）
  INVALID_KEY: 'invalid_key', // 401 - APIキー無効
  NOT_FOUND: 'not_found', // 404 - 見つからない
  INVALID_CHANNEL_ID: 'invalid_channel_id', // 400 - チャンネルID形式エラー
  BAD_REQUEST: 'bad_request', // 400 - 不正なリクエスト
  TIMEOUT: 'timeout', // 504 - タイムアウト
};

/**
 * メインのリクエストハンドラー
 */
export default {
  async fetch(request, env, ctx) {
    // Originチェック：許可されていない場合は403を返す
    const origin = request.headers.get('Origin');
    if (origin && !isOriginAllowed(origin)) {
      return new Response('Forbidden: Origin not allowed', {
        status: 403,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    // CORS プリフライトリクエストの処理
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    // GET リクエストのみ許可
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // エンドポイント分岐: /resolve-channel
      if (pathname === '/resolve-channel') {
        return await handleResolveChannel(request, env);
      }

      // 新エンドポイント: /fetch-videos
      if (pathname === '/fetch-videos') {
        return await handleFetchVideos(request, env);
      }

      // デフォルト: CORS Proxy機能（YouTube RSSのみ）
      // URLパラメータから対象URLを取得
      const targetUrl = url.searchParams.get('url');

      // URLパラメータのバリデーション
      if (!targetUrl) {
        return createErrorResponse('Missing "url" parameter', 400, request);
      }

      // YouTube RSS URLの検証（セキュリティ: オープンプロキシ防止）
      if (!YOUTUBE_RSS_PATTERN.test(targetUrl)) {
        return createErrorResponse(
          'Invalid URL. Only YouTube RSS feeds are allowed.',
          403,
          request
        );
      }

      // YouTube RSSをフェッチ（Cloudflare Cacheを有効化、5分間キャッシュ）
      const response = await fetchWithTimeout(targetUrl, DEFAULT_TIMEOUT_MS, true, CACHE_TTL_SECONDS);

      // レスポンスの検証
      if (!response.ok) {
        return createErrorResponse(
          `YouTube RSS fetch failed: ${response.status} ${response.statusText}`,
          response.status,
          request
        );
      }

      // XMLテキストを取得
      const xmlText = await response.text();

      // XMLパースエラー検出（簡易チェック）
      if (!xmlText.includes('<?xml') || !xmlText.includes('<feed')) {
        return createErrorResponse('Invalid XML response from YouTube', 502, request);
      }

      // 成功レスポンスを返す
      const allowedOrigin = getAllowedOrigin(request);
      return new Response(xmlText, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Access-Control-Allow-Origin': allowedOrigin || '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Vary': 'Origin',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`, // 5分間キャッシュ
          'X-Proxy-By': 'YouTube-List-Tool-Worker',
        },
      });

    } catch (error) {
      console.error('Worker error:', error);
      return createErrorResponse(
        `Proxy error: ${error && error.message ? error.message : String(error)}`,
        500,
        request
      );
    }
  },
};

/**
 * /fetch-videos: YouTube Data API v3 からアップロード動画を段階的に取得
 *
 * クエリ:
 * - channelId: UCで始まる24文字（必須）
 * - limit: 1～50（デフォルト50）
 * - startDate: YYYY-MM-DD（省略可）
 * - endDate: YYYY-MM-DD（省略可）
 * - pageToken: 次ページ用トークン（省略可）
 *
 * 仕様:
 * - 1回のリクエストで最大50件返却
 * - 内部的には最大10ページ（500件）までスキャン
 * - startDate/endDate による早期打ち切り
 * - タイムアウト: 30秒（1リクエストあたり）
 * - キャッシュ: 5分（パラメータ単位）
 * - 削除/非公開動画は除外
 * - UC → UU への変換で uploads playlist を直接参照
 */
async function handleFetchVideos(request, env) {
  const allowedOrigin = getAllowedOrigin(request);
  const url = new URL(request.url);

  // クエリ取得
  const channelId = url.searchParams.get('channelId') || '';
  const limitRaw = url.searchParams.get('limit');
  const startDateRaw = url.searchParams.get('startDate') || '';
  const endDateRaw = url.searchParams.get('endDate') || '';
  const pageTokenInitial = url.searchParams.get('pageToken') || '';

  // 入力バリデーション
  if (!/^(UC)[0-9A-Za-z_-]{22}$/.test(channelId)) {
    return jsonError(
      {
        code: ERROR_CODES.INVALID_CHANNEL_ID,
        message: 'チャンネルIDの形式が不正です（UCで始まる24文字）。',
      },
      400,
      allowedOrigin
    );
  }

  const limit = clamp(Number.parseInt(limitRaw || '50', 10), 1, MAX_PAGE_RESULTS);

  // 日付パース
  let startDate = null;
  let endDate = null;
  if (startDateRaw) {
    startDate = parseISODateStart(startDateRaw);
    if (!startDate) {
      return jsonError(
        { code: ERROR_CODES.BAD_REQUEST, message: 'startDate の形式が不正です（YYYY-MM-DD）。' },
        400,
        allowedOrigin
      );
    }
  }
  if (endDateRaw) {
    endDate = parseISODateEnd(endDateRaw);
    if (!endDate) {
      return jsonError(
        { code: ERROR_CODES.BAD_REQUEST, message: 'endDate の形式が不正です（YYYY-MM-DD）。' },
        400,
        allowedOrigin
      );
    }
  }
  if (startDate && endDate && startDate > endDate) {
    return jsonError(
      { code: ERROR_CODES.BAD_REQUEST, message: 'startDate は endDate 以前である必要があります。' },
      400,
      allowedOrigin
    );
  }

  // キャッシュキー（Queryパラメータを正規化して5分キャッシュ）
  const cacheKeyUrl = new URL('https://cache.youtubelisttool.local/fetch-videos');
  cacheKeyUrl.searchParams.set('channelId', channelId);
  cacheKeyUrl.searchParams.set('limit', String(limit));
  if (startDateRaw) cacheKeyUrl.searchParams.set('startDate', startDateRaw);
  if (endDateRaw) cacheKeyUrl.searchParams.set('endDate', endDateRaw);
  if (pageTokenInitial) cacheKeyUrl.searchParams.set('pageToken', pageTokenInitial);
  const cache = caches.default;
  const cacheRequest = new Request(cacheKeyUrl.toString(), { method: 'GET' });

  // Cache からの取得
  const cached = await cache.match(cacheRequest);
  if (cached) {
    // CORS ヘッダーを付与して返却
    const body = await cached.arrayBuffer();
    const headers = new Headers(cached.headers);
    headers.set('Access-Control-Allow-Origin', allowedOrigin || '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Vary', 'Origin');
    headers.set('X-Cache', 'HIT');
    return new Response(body, { status: cached.status, headers });
  }

  // APIキー取得
  const apiKey = getYouTubeApiKey(env);
  if (!apiKey) {
    return jsonError(
      { code: ERROR_CODES.INVALID_KEY, message: 'YouTube API キーが設定されていません。' },
      401,
      allowedOrigin
    );
  }

  // レート制限（Durable Object）
  const clientKey = `fetch-videos:${getClientKey(request)}`;
  const rateLimit = await checkRateLimit(env, clientKey, 60, 60_000); // 60req/分
  if (rateLimit.limited) {
    return jsonError(
      {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'リクエストが多すぎます。しばらくしてから再試行してください。',
        retryAfterSec: rateLimit.retryAfterSec,
      },
      429,
      allowedOrigin,
      rateLimit.retryAfterSec
    );
  }

  // UC → UU 変換（uploads playlist）
  const uploadsPlaylistId = 'UU' + channelId.slice(2);

  // ページング取得
  let pageToken = pageTokenInitial;
  let pageCount = 0;
  let scannedTotal = 0;
  let videos = [];
  let nextPageTokenOut = '';
  let partial = false;
  let earlyStopByDate = false;

  // 最大10ページまたは limit 件を満たすまで繰り返し
  while (pageCount < MAX_PAGES && videos.length < limit) {
    pageCount++;

    // YouTube Data API: playlistItems.list
    const endpoint = '/playlistItems';
    const params = new URLSearchParams();
    params.set('part', 'snippet');
    params.set('playlistId', uploadsPlaylistId);
    params.set('maxResults', String(MAX_PAGE_RESULTS));
    if (pageToken) params.set('pageToken', pageToken);
    params.set('fields', 'items(snippet(title,publishedAt,resourceId/videoId)),nextPageToken');
    params.set('prettyPrint', 'false');
    params.set('key', apiKey);

    const apiRes = await youtubeApiFetchJson(
      endpoint,
      params,
      {
        timeoutMs: FETCH_VIDEOS_TIMEOUT_MS,
        maxRetries: 3,
        request,
        env,
      }
    );

    if (apiRes.error) {
      // エラーをそのまま返却（統一フォーマット）
      return jsonError(apiRes.error, apiRes.status || 500, allowedOrigin, apiRes.retryAfterSec);
    }

    const data = apiRes.data || {};
    const items = Array.isArray(data.items) ? data.items : [];
    scannedTotal += items.length;

    // アイテムが空で nextPageToken も無ければ終了
    if (!items.length && !data.nextPageToken) {
      nextPageTokenOut = '';
      partial = false;
      break;
    }

    // ページ内の項目をフィルタ（削除/非公開、日付レンジ）
    const pageVideos = [];
    let pageOldestDate = null;

    for (const it of items) {
      const sn = it && it.snippet ? it.snippet : null;
      if (!sn) continue;

      const title = (sn.title || '').trim();
      // 削除/非公開動画を除外
      if (!sn.resourceId || !sn.resourceId.videoId) continue;
      if (title === 'Deleted video' || title === 'Private video') continue;

      const published = new Date(sn.publishedAt);
      if (isNaN(published.getTime())) continue;

      // ページ内の最古日付を記録（早期打ち切り判定のため）
      if (!pageOldestDate || published < pageOldestDate) {
        pageOldestDate = published;
      }

      // 日付フィルタ
      if (startDate && published < startDate) continue;
      if (endDate && published > endDate) continue;

      pageVideos.push({
        url: `https://www.youtube.com/watch?v=${sn.resourceId.videoId}`,
        title,
        published: published.toISOString(),
      });
    }

    // 収集
    for (const v of pageVideos) {
      if (videos.length < limit) videos.push(v);
    }

    // 早期打ち切り（startDate より古いものしか残っていないと判断できる場合）
    if (startDate && pageOldestDate && pageOldestDate < startDate) {
      earlyStopByDate = true;
    }

    // 次ページ判定
    if (videos.length >= limit) {
      // まだ続きがある
      nextPageTokenOut = data.nextPageToken || '';
      partial = Boolean(nextPageTokenOut);
      break;
    } else if (data.nextPageToken && !earlyStopByDate) {
      // 次ページへ
      pageToken = data.nextPageToken;
      nextPageTokenOut = pageToken; // ひとまず保持（更新され続ける）
      partial = true;
      continue;
    } else {
      // 次ページなし、または日付で打ち切り
      nextPageTokenOut = '';
      partial = false;
      break;
    }
  }

  // レスポンス構築
  const payload = {
    ok: true,
    channelId,
    count: videos.length,
    totalFetched: scannedTotal,
    partial,
    nextPageToken: partial ? nextPageTokenOut : '',
    videos,
  };

  // キャッシュに保存（5分）
  const jsonText = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowedOrigin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    'X-Cache': 'MISS',
  };
  const response = new Response(jsonText, { status: 200, headers });

  try {
    await cache.put(
      cacheRequest,
      new Response(jsonText, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        },
      })
    );
  } catch (e) {
    // キャッシュ書き込み失敗は無視（ログのみ）
    console.warn('Cache put failed for /fetch-videos:', e && e.message ? e.message : e);
  }

  return response;
}

/**
 * /resolve-channel: @handle → channelId 変換
 *
 * 入力:
 * - handle: "@foobar" / "foobar" / "https://www.youtube.com/@foobar"
 * - または q / url など複数エイリアスに対応
 * - 既に channelId(UC...) の場合は検証してそのまま返す
 *
 * 実装:
 * - YouTube Data API channels.list (forHandle) を使用
 * - fields で最小限に絞り、Cache API で 5 分キャッシュ
 */
async function handleResolveChannel(request, env) {
  const allowedOrigin = getAllowedOrigin(request);
  const url = new URL(request.url);

  const raw =
    url.searchParams.get('handle') ||
    url.searchParams.get('q') ||
    url.searchParams.get('url') ||
    url.searchParams.get('id') ||
    '';

  if (!raw) {
    return jsonError(
      { code: ERROR_CODES.BAD_REQUEST, message: 'handle（@ハンドル名）または URL を指定してください。' },
      400,
      allowedOrigin
    );
  }

  // 既に UC 形式なら検証してそのまま返却
  const ucCandidate = extractChannelId(raw);
  if (ucCandidate) {
    return jsonOk(
      {
        ok: true,
        input: raw,
        channelId: ucCandidate,
      },
      allowedOrigin
    );
  }

  // @handle を抽出
  const handle = extractHandle(raw);
  if (!handle) {
    return jsonError(
      { code: ERROR_CODES.BAD_REQUEST, message: '有効な @ハンドル を抽出できませんでした。' },
      400,
      allowedOrigin
    );
  }

  // キャッシュキー
  const cacheKeyUrl = new URL('https://cache.youtubelisttool.local/resolve-channel');
  cacheKeyUrl.searchParams.set('handle', handle);
  const cache = caches.default;
  const cacheRequest = new Request(cacheKeyUrl.toString(), { method: 'GET' });

  const cached = await cache.match(cacheRequest);
  if (cached) {
    const body = await cached.arrayBuffer();
    const headers = new Headers(cached.headers);
    headers.set('Access-Control-Allow-Origin', allowedOrigin || '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Vary', 'Origin');
    headers.set('X-Cache', 'HIT');
    return new Response(body, { status: cached.status, headers });
  }

  // APIキー
  const apiKey = getYouTubeApiKey(env);
  if (!apiKey) {
    return jsonError(
      { code: ERROR_CODES.INVALID_KEY, message: 'YouTube API キーが設定されていません。' },
      401,
      allowedOrigin
    );
  }

  // レート制限（Durable Object）
  const clientKey = `resolve-channel:${getClientKey(request)}`;
  const rateLimit = await checkRateLimit(env, clientKey, 120, 60_000); // 120req/分
  if (rateLimit.limited) {
    return jsonError(
      {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'リクエストが多すぎます。しばらくしてから再試行してください。',
        retryAfterSec: rateLimit.retryAfterSec,
      },
      429,
      allowedOrigin,
      rateLimit.retryAfterSec
    );
  }

  // YouTube Data API: channels.list (forHandle)
  const endpoint = '/channels';
  const params = new URLSearchParams();
  params.set('part', 'id');
  params.set('forHandle', handle.startsWith('@') ? handle : `@${handle}`);
  params.set('fields', 'items(id)');
  params.set('prettyPrint', 'false');
  params.set('key', apiKey);

  const apiRes = await youtubeApiFetchJson(
    endpoint,
    params,
    {
      timeoutMs: 15_000,
      maxRetries: 3,
      request,
      env,
    }
  );

  if (apiRes.error) {
    return jsonError(apiRes.error, apiRes.status || 500, allowedOrigin, apiRes.retryAfterSec);
  }

  const data = apiRes.data || {};
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length || !items[0] || !items[0].id) {
    return jsonError({ code: ERROR_CODES.NOT_FOUND, message: 'チャンネルが見つかりませんでした。' }, 404, allowedOrigin);
  }
  const channelId = items[0].id;

  const respPayload = {
    ok: true,
    input: raw,
    channelId,
  };
  const jsonText = JSON.stringify(respPayload);
  const response = new Response(jsonText, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': allowedOrigin || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
      'X-Cache': 'MISS',
    },
  });

  try {
    await cache.put(
      cacheRequest,
      new Response(jsonText, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        },
      })
    );
  } catch (e) {
    console.warn('Cache put failed for /resolve-channel:', e && e.message ? e.message : e);
  }

  return response;
}

/**
 * CORS プリフライトの処理
 */
function handleCORS(request) {
  const allowedOrigin = getAllowedOrigin(request);
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    },
  });
}

/**
 * 許可されたオリジンかどうかを判定
 */
function isOriginAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (PREVIEW_ORIGIN_REGEX.test(origin)) return true;
  return false;
}

/**
 * レスポンス用に許可オリジンを取得
 */
function getAllowedOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && isOriginAllowed(origin)) return origin;
  return '';
}

/**
 * 既存のプロキシ用エラーレスポンス（テキスト）
 */
function createErrorResponse(message, status = 500, request) {
  const allowedOrigin = getAllowedOrigin(request);
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': allowedOrigin || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * JSON エラーの統一レスポンス
 */
function jsonError(errorObj, status = 500, allowedOrigin = '', retryAfterSec) {
  const body = JSON.stringify({ ok: false, ...errorObj });
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowedOrigin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
  if (retryAfterSec && Number.isFinite(retryAfterSec)) {
    headers['Retry-After'] = String(Math.max(0, Math.floor(retryAfterSec)));
  }
  return new Response(body, { status, headers });
}

/**
 * JSON OK レスポンス
 */
function jsonOk(payload, allowedOrigin = '') {
  const body = JSON.stringify(payload);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': allowedOrigin || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
}

/**
 * フェッチ（オプションで Cache API を使用）+ タイムアウト
 *
 * useCache: true のとき Cache API に 5 分保存（TTL は引数）
 * 注意: Cache API は Request/Response の Cache-Control を尊重
 */
async function fetchWithTimeout(input, timeoutMs = DEFAULT_TIMEOUT_MS, useCache = false, cacheTtlSec = CACHE_TTL_SECONDS, extraInit = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort('timeout'), timeoutMs);

  try {
    const req = input instanceof Request
      ? input
      : new Request(String(input), {
          method: 'GET',
          headers: {
            'User-Agent': USER_AGENT,
          },
          ...extraInit,
          signal: controller.signal,
        });

    if (!useCache) {
      const res = await fetch(req, { signal: controller.signal });
      return res;
    }

    // Cache API
    const cache = caches.default;
    const cacheKey = new Request(req.url, { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const res = await fetch(req, { signal: controller.signal });
    if (res.ok) {
      const headers = new Headers(res.headers);
      headers.set('Cache-Control', `public, max-age=${cacheTtlSec}`);
      const cacheable = new Response(res.body, {
        status: res.status,
        headers,
      });
      try {
        await cache.put(cacheKey, cacheable.clone());
      } catch (e) {
        console.warn('Cache put failed:', e && e.message ? e.message : e);
      }
      return cacheable;
    }
    return res;
  } catch (err) {
    if (err && String(err).includes('timeout')) {
      const res = new Response('Upstream timeout', { status: 504 });
      return res;
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

/**
 * YouTube API 用の fetch ラッパー
 * - タイムアウト
 * - 指数バックオフ + リトライ（最大3回）
 * - Retry-After を尊重
 * - エラーマッピング（統一コード）
 * - 429/5xx/一部403（rateLimitExceeded）は再試行
 * - 403（quotaExceeded）は即時エラー
 * - 401/400/404 は即時エラー
 */
async function youtubeApiFetchJson(endpoint, params, { timeoutMs, maxRetries, request, env }) {
  const url = new URL(YT_API_BASE + endpoint);
  for (const [k, v] of params.entries()) url.searchParams.set(k, v);

  let attempt = 0;
  let waitMs = 500;

  while (attempt <= maxRetries) {
    attempt++;

    try {
      const res = await fetchWithTimeout(
        new Request(url.toString(), {
          headers: {
            'User-Agent': USER_AGENT,
          },
        }),
        timeoutMs,
        false
      );

      // タイムアウトは fetchWithTimeout が 504 で返し得る
      if (res.status === 504) {
        if (attempt <= maxRetries) {
          await sleep(waitMs);
          waitMs *= 2;
          continue;
        }
        return {
          error: { code: ERROR_CODES.TIMEOUT, message: 'YouTube API の応答がタイムアウトしました。' },
          status: 504,
        };
      }

      // OK
      if (res.ok) {
        let data = null;
        try {
          data = await res.json();
        } catch {
          data = {};
        }
        return { data, status: res.status };
      }

      // エラー解析
      const text = await res.text();
      const errInfo = parseYouTubeApiError(text) || {};
      const reason = errInfo.reason || '';
      const message = errInfo.message || `YouTube API error: ${res.status}`;

      // 再試行条件
      if (res.status === 429) {
        const retryAfterSec = parseRetryAfter(res.headers.get('Retry-After')) || Math.ceil(waitMs / 1000);
        if (attempt <= maxRetries) {
          await sleep(retryAfterSec * 1000);
          continue;
        }
        return {
          error: { code: ERROR_CODES.RATE_LIMITED, message: 'YouTube API のレート制限に達しました。', retryAfterSec },
          status: 429,
          retryAfterSec,
        };
      }

      if (res.status >= 500 && res.status < 600) {
        if (attempt <= maxRetries) {
          await sleep(waitMs);
          waitMs *= 2;
          continue;
        }
        return {
          error: { code: ERROR_CODES.BAD_REQUEST, message: 'YouTube API でサーバーエラーが発生しました。' },
          status: res.status,
        };
      }

      if (res.status === 403) {
        if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
          return {
            error: { code: ERROR_CODES.QUOTA_EXCEEDED, message: 'YouTube API のクォータを超過しました。' },
            status: 403,
          };
        }
        if (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
          // 再試行対象
          if (attempt <= maxRetries) {
            await sleep(waitMs);
            waitMs *= 2;
            continue;
          }
          return {
            error: { code: ERROR_CODES.RATE_LIMITED, message: 'YouTube API のレート制限に達しました。' },
            status: 429,
          };
        }
        return {
          error: { code: ERROR_CODES.BAD_REQUEST, message: message || 'アクセスが拒否されました。' },
          status: 403,
        };
      }

      if (res.status === 401) {
        return { error: { code: ERROR_CODES.INVALID_KEY, message: 'YouTube API キーが無効です。' }, status: 401 };
      }

      if (res.status === 404) {
        return { error: { code: ERROR_CODES.NOT_FOUND, message: '対象が見つかりませんでした。' }, status: 404 };
      }

      if (res.status === 400) {
        // 無効なパラメータ等（playlistId 無効など）
        return {
          error: {
            code: ERROR_CODES.BAD_REQUEST,
            message: message || '不正なリクエストです。',
          },
          status: 400,
        };
      }

      // その他
      return { error: { code: ERROR_CODES.BAD_REQUEST, message: message }, status: res.status };
    } catch (e) {
      // ネットワーク例外等
      if (attempt <= maxRetries) {
        await sleep(waitMs);
        waitMs *= 2;
        continue;
      }
      return {
        error: { code: ERROR_CODES.BAD_REQUEST, message: 'YouTube API の呼び出しに失敗しました。' },
        status: 502,
      };
    }
  }

  return {
    error: { code: ERROR_CODES.BAD_REQUEST, message: 'YouTube API の呼び出しに失敗しました。' },
    status: 502,
  };
}

/**
 * Durable Object によるレート制限チェック
 * - key: 識別子（IP等）
 * - limit: 許容回数
 * - windowMs: 窓期間（ミリ秒）
 */
async function checkRateLimit(env, key, limit, windowMs) {
  try {
    if (!env || !env.RATE_LIMITER) {
      // DO 未バインド時は常に許可（開発用途）
      return { limited: false, remaining: Number.MAX_SAFE_INTEGER, retryAfterSec: 0 };
    }
    const id = env.RATE_LIMITER.idFromName(key);
    const stub = env.RATE_LIMITER.get(id);
    const resp = await stub.fetch(`http://limit/?key=${encodeURIComponent(key)}&limit=${limit}&windowMs=${windowMs}`);
    const data = await resp.json();
    return {
      limited: !!data.limited,
      remaining: typeof data.remaining === 'number' ? data.remaining : 0,
      retryAfterSec: typeof data.retryAfterSec === 'number' ? data.retryAfterSec : 0,
    };
  } catch (e) {
    // 失敗した場合は fail-open
    console.warn('RateLimiter check failed:', e && e.message ? e.message : e);
    return { limited: false, remaining: Number.MAX_SAFE_INTEGER, retryAfterSec: 0 };
  }
}

/**
 * YouTube API エラー本文の簡易パース
 * - RFC7807 風 or Google API 形式に対応
 */
function parseYouTubeApiError(text) {
  try {
    const obj = JSON.parse(text);
    if (obj && obj.error) {
      // Google APIs 標準
      const e = obj.error;
      if (Array.isArray(e.errors) && e.errors[0]) {
        return { message: e.message || '', reason: e.errors[0].reason || '' };
      }
      if (e.status && e.message) {
        // 新しいエラーフォーマット
        // details[].errors[].reason のこともあるが最低限解析
        const reason =
          (Array.isArray(e.details) &&
            e.details.find((d) => Array.isArray(d.errors) && d.errors[0] && d.errors[0].reason)?.errors?.[0]?.reason) ||
          '';
        return { message: e.message, reason };
      }
      return { message: e.message || 'YouTube API error', reason: '' };
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Retry-After を秒にパース
 */
function parseRetryAfter(v) {
  if (!v) return 0;
  const sec = Number.parseInt(v, 10);
  if (Number.isFinite(sec)) return Math.max(0, sec);
  const date = new Date(v);
  if (!isNaN(date.getTime())) {
    const now = Date.now();
    return Math.max(0, Math.ceil((date.getTime() - now) / 1000));
  }
  return 0;
}

/**
 * ヘルパー: sleep
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * clamp
 */
function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}

/**
 * YYYY-MM-DD → Date(UTC start-of-day)
 */
function parseISODateStart(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * YYYY-MM-DD → Date(UTC end-of-day)
 */
function parseISODateEnd(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T23:59:59.999Z`);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * 入力から @handle を抽出
 */
function extractHandle(raw) {
  const s = String(raw).trim();
  // URL の場合
  try {
    const u = new URL(s);
    // /@handle or /handle
    const m = u.pathname.match(/\/@?([^/]+)/);
    if (m && m[1]) {
      return m[0].startsWith('/@') ? `@${m[1]}` : `@${m[1]}`;
    }
  } catch {
    // ignore
  }
  // @付き or プレーン文字列
  if (s.startsWith('@')) return s;
  if (/^[A-Za-z0-9._-]+$/.test(s)) return `@${s}`;
  return '';
}

/**
 * 入力から UC チャンネルIDを抽出（見つからなければ空文字）
 */
function extractChannelId(raw) {
  const s = String(raw).trim();
  // そのまま UC... 形式か？
  if (/^(UC)[0-9A-Za-z_-]{22}$/.test(s)) return s;
  // URL 内に含まれるか？
  try {
    const u = new URL(s);
    const qId = u.searchParams.get('channel') || u.searchParams.get('channel_id');
    if (qId && /^(UC)[0-9A-Za-z_-]{22}$/.test(qId)) return qId;
    // /channel/UCxxxx
    const m = u.pathname.match(/\/channel\/(UC[0-9A-Za-z_-]{22})/);
    if (m && m[1]) return m[1];
  } catch {
    // ignore
  }
  return '';
}

/**
 * クライアント識別キー（IPベース + Origin）
 */
function getClientKey(request) {
  const ip = request.headers.get('CF-Connecting-IP') ||
             request.headers.get('X-Forwarded-For') ||
             'unknown';
  const origin = request.headers.get('Origin') || '';
  return `${ip}:${origin}`;
}

/**
 * YouTube API キーを取得
 */
function getYouTubeApiKey(env) {
  return env && (env.YT_API_KEY || env.YOUTUBE_API_KEY || env.GOOGLE_API_KEY);
}

/**
 * Durable Object: RateLimiter
 *
 * シンプルな固定ウィンドウカウンタ方式
 * - key: 識別子（IP等）
 * - limit: 許容回数
 * - windowMs: 窓期間（ミリ秒）
 *
 * ストレージに { windowStart: number, count: number } を保存
 */
export class RateLimiter {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);

      const key = url.searchParams.get('key') || 'global';
      const limit = clamp(Number.parseInt(url.searchParams.get('limit') || '60', 10), 1, 100000);
      const windowMs = clamp(Number.parseInt(url.searchParams.get('windowMs') || '60000', 10), 100, 86_400_000);

      const now = Date.now();
      const storageKey = `rl:${key}`;
      let data = await this.state.storage.get(storageKey);

      if (!data || typeof data !== 'object') {
        data = { windowStart: now, count: 0 };
      }

      let { windowStart, count } = data;

      // ウィンドウ更新
      if (now - windowStart >= windowMs) {
        windowStart = now;
        count = 0;
      }

      // インクリメント
      count += 1;

      // 保存
      await this.state.storage.put(storageKey, { windowStart, count });

      // 判定
      let limited = false;
      let retryAfterSec = 0;
      if (count > limit) {
        limited = true;
        const resetInMs = windowMs - (now - windowStart);
        retryAfterSec = Math.max(0, Math.ceil(resetInMs / 1000));
      }

      const remaining = Math.max(0, limit - count);

      return new Response(
        JSON.stringify({ limited, remaining, retryAfterSec }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        }
      );
    } catch (e) {
      return new Response(
        JSON.stringify({
          limited: false,
          remaining: 0,
          retryAfterSec: 0,
          error: String(e && e.message ? e.message : e),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
  }
}
