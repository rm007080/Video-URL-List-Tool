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
    // CORS プリフライトリクエストの処理
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    // GET リクエストのみ許可
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // URLパラメータから対象URLを取得
      const url = new URL(request.url);
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

      // YouTube RSSをフェッチ
      const response = await fetchWithTimeout(targetUrl, 10000);

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
      return new Response(xmlText, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Access-Control-Allow-Origin': getAllowedOrigin(request),
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
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
 * タイムアウト付きfetch
 * @param {string} url - フェッチ対象URL
 * @param {number} timeout - タイムアウト時間（ミリ秒）
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'YouTube-List-Tool-Worker/1.0',
      },
    });
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
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getAllowedOrigin(request),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400', // 24時間キャッシュ
    },
  });
}

/**
 * 許可されたオリジンを取得
 * @param {Request} request
 * @returns {string}
 */
function getAllowedOrigin(request) {
  const origin = request.headers.get('Origin');

  // オリジンが許可リストに含まれている場合はそのまま返す
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }

  // デフォルトは最初の許可オリジン
  return ALLOWED_ORIGINS[0];
}

/**
 * エラーレスポンスを作成
 * @param {string} message - エラーメッセージ
 * @param {number} status - HTTPステータスコード
 * @param {Request} request
 * @returns {Response}
 */
function createErrorResponse(message, status, request) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': getAllowedOrigin(request),
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  );
}
