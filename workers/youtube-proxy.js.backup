/**
 * YouTube List Tool - CORS Proxy Worker
 * Cloudflare Workers で動作する自前CORS Proxy
 *
 * セキュリティ対策:
 * - YouTube RSS URLのみを許可（ホワイトリスト方式）
 * - 適切なCORSヘッダーを設定
 * - タイムアウト処理
 */

// 許可するオリジン（本番環境のURLに変更してください）
const ALLOWED_ORIGINS = [
  'http://localhost:8000',
  'http://localhost:3000',
  'http://127.0.0.1:8000',
  'https://youtubelisttool.pages.dev', // Cloudflare Pages 本番URL
];

// YouTube RSS URLのパターン
const YOUTUBE_RSS_PATTERN = /^https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=UC[\w-]{22}$/;

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
          'Content-Type': 'text/plain',
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

      // デフォルト: CORS Proxy機能
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
      const response = await fetchWithTimeout(targetUrl, 10000, true, 300);

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
          'Cache-Control': 'public, max-age=300', // 5分間キャッシュ
          'X-Proxy-By': 'YouTube-List-Tool-Worker',
        },
      });

    } catch (error) {
      console.error('Worker error:', error);
      return createErrorResponse(
        `Proxy error: ${error.message}`,
        500,
        request
      );
    }
  },
};

/**
 * タイムアウト付きfetch（Cloudflare Cacheオプション付き）
 * @param {string} url - フェッチ対象URL
 * @param {number} timeout - タイムアウト時間（ミリ秒）
 * @param {boolean} useCache - Cloudflare Cacheを使用するか（デフォルト: false）
 * @param {number} cacheTtl - キャッシュTTL（秒）
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, timeout, useCache = false, cacheTtl = 300) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const fetchOptions = {
      signal: controller.signal,
      headers: {
        'User-Agent': 'YouTube-List-Tool-Worker/1.0',
      },
    };

    // Cloudflare Cacheオプションを追加（YouTubeへのリクエストを削減）
    if (useCache) {
      fetchOptions.cf = {
        cacheEverything: true,
        cacheTtl: cacheTtl,
      };
    }

    const response = await fetch(url, fetchOptions);
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * CORSプリフライトリクエストの処理
 * @param {Request} request
 * @returns {Response}
 */
function handleCORS(request) {
  const allowedOrigin = getAllowedOrigin(request);
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400', // 24時間キャッシュ
      'Vary': 'Origin',
    },
  });
}

/**
 * Originが許可されているかチェック
 * @param {string} origin
 * @returns {boolean}
 */
function isOriginAllowed(origin) {
  if (!origin) return false;

  try {
    const url = new URL(origin);
    const protocol = url.protocol;
    const host = url.host;

    // ローカル開発環境（HTTP許可）
    if (protocol === 'http:' &&
        (host.startsWith('localhost:') || host.startsWith('127.0.0.1:'))) {
      return ALLOWED_ORIGINS.includes(origin);
    }

    // HTTPS必須（本番・Preview環境）
    if (protocol !== 'https:') {
      return false;
    }

    // 完全一致チェック
    if (ALLOWED_ORIGINS.includes(origin)) {
      return true;
    }

    // Preview環境（*.youtubelisttool.pages.dev）を許可
    if (host === 'youtubelisttool.pages.dev' ||
        host.endsWith('.youtubelisttool.pages.dev')) {
      return true;
    }

    return false;
  } catch (e) {
    return false;
  }
}

/**
 * 許可されたオリジンを取得
 * @param {Request} request
 * @returns {string|null}
 */
function getAllowedOrigin(request) {
  const origin = request.headers.get('Origin');

  if (origin && isOriginAllowed(origin)) {
    return origin;
  }

  // 許可されない場合はnullを返す
  return null;
}

/**
 * エラーレスポンスを作成
 * @param {string} message - エラーメッセージ
 * @param {number} status - HTTPステータスコード
 * @param {Request} request
 * @returns {Response}
 */
function createErrorResponse(message, status, request) {
  const allowedOrigin = getAllowedOrigin(request);
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowedOrigin || '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}

/**
 * @username をチャンネルIDに解決する（Cache API対応）
 * @param {Request} request
 * @param {Object} env - 環境変数（YOUTUBE_API_KEY を含む）
 * @returns {Promise<Response>}
 */
async function handleResolveChannel(request, env) {
  try {
    const url = new URL(request.url);
    const username = url.searchParams.get('username');

    // username パラメータのバリデーション
    if (!username) {
      return createErrorResponse('Missing "username" parameter', 400, request);
    }

    // @ を除去（@mkbhd → mkbhd）
    const cleanUsername = username.replace(/^@/, '');

    // YouTubeハンドルの形式チェック（英数字、アンダースコア、ハイフン、ドットのみ、3-30文字）
    const handlePattern = /^[A-Za-z0-9._-]{3,30}$/;
    if (!handlePattern.test(cleanUsername)) {
      return createErrorResponse(
        'Invalid username format. Must be 3-30 characters (letters, numbers, _, -, .)',
        400,
        request
      );
    }

    // ハンドル名を小文字に正規化（YouTubeは大小文字を区別しない）
    const normalizedUsername = cleanUsername.toLowerCase();

    // Cache APIでキャッシュをチェック
    const cacheKey = new Request(`https://cache/resolve?u=${normalizedUsername}`);
    const cache = caches.default;
    let cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      // キャッシュヒット：データを取得してCORSヘッダを付与して返す
      const cachedData = await cachedResponse.text();
      const allowedOrigin = getAllowedOrigin(request);

      return new Response(cachedData, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': allowedOrigin || '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Vary': 'Origin',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'public, max-age=86400',
          'X-Proxy-By': 'YouTube-List-Tool-Worker',
          'X-Cache': 'HIT', // デバッグ用
        },
      });
    }

    // キャッシュミス：YouTube Data API v3 でチャンネル情報を取得
    // APIキーの確認
    if (!env.YOUTUBE_API_KEY) {
      console.error('YOUTUBE_API_KEY is not set in environment variables');
      return createErrorResponse('Server configuration error', 500, request);
    }

    // forHandle パラメータを使用（@username に対応）
    const apiUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
    apiUrl.searchParams.set('part', 'id');
    apiUrl.searchParams.set('forHandle', normalizedUsername);
    apiUrl.searchParams.set('key', env.YOUTUBE_API_KEY);

    const response = await fetchWithTimeout(apiUrl.toString(), 10000);

    if (!response.ok) {
      console.error(`YouTube API error: ${response.status} ${response.statusText}`);
      return createErrorResponse(
        `YouTube API request failed: ${response.status}`,
        response.status,
        request
      );
    }

    const data = await response.json();

    // チャンネルが見つからない場合
    if (!data.items || data.items.length === 0) {
      return createErrorResponse(
        `Channel not found for username: @${cleanUsername}`,
        404,
        request
      );
    }

    // チャンネルIDを取得
    const channelId = data.items[0].id;

    // レスポンスデータを作成
    const responseData = JSON.stringify({
      username: `@${cleanUsername}`,
      channelId: channelId,
    });

    // Cache APIにデータを保存（CORSヘッダなし、データのみ）
    const cacheResponse = new Response(responseData, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400', // 24時間
      },
    });
    await cache.put(cacheKey, cacheResponse);

    // クライアントにレスポンスを返す（CORSヘッダ付き）
    const allowedOrigin = getAllowedOrigin(request);
    return new Response(responseData, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowedOrigin || '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=86400',
        'X-Proxy-By': 'YouTube-List-Tool-Worker',
        'X-Cache': 'MISS', // デバッグ用
      },
    });

  } catch (error) {
    console.error('Resolve channel error:', error);
    return createErrorResponse(
      `Failed to resolve channel: ${error.message}`,
      500,
      request
    );
  }
}
