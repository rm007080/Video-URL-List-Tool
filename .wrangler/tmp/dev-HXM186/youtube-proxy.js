var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-tMlVQF/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// workers/youtube-proxy.js
var ALLOWED_ORIGINS = [
  "http://localhost:8000",
  "http://localhost:3000",
  "http://127.0.0.1:8000",
  "https://youtubelisttool.pages.dev"
  // Cloudflare Pages 本番URL
];
var PREVIEW_ORIGIN_REGEX = /^https:\/\/[a-z0-9-]+\.youtubelisttool\.pages\.dev$/i;
var YOUTUBE_RSS_PATTERN = /^https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=UC[\w-]{22}$/;
var YT_API_BASE = "https://www.googleapis.com/youtube/v3";
var DEFAULT_TIMEOUT_MS = 1e4;
var FETCH_VIDEOS_TIMEOUT_MS = 3e4;
var MAX_PAGE_RESULTS = 50;
var MAX_PAGES = 10;
var CACHE_TTL_SECONDS = 300;
var USER_AGENT = "YouTubeListTool-Worker/1.0 (+https://youtubelisttool.pages.dev)";
var ERROR_CODES = {
  QUOTA_EXCEEDED: "quota_exceeded",
  // 403 - クォータ超過
  RATE_LIMITED: "rate_limited",
  // 429 - レート制限（Durable Object）
  INVALID_KEY: "invalid_key",
  // 401 - APIキー無効
  NOT_FOUND: "not_found",
  // 404 - 見つからない
  INVALID_CHANNEL_ID: "invalid_channel_id",
  // 400 - チャンネルID形式エラー
  BAD_REQUEST: "bad_request",
  // 400 - 不正なリクエスト
  TIMEOUT: "timeout"
  // 504 - タイムアウト
};
var youtube_proxy_default = {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    if (origin && !isOriginAllowed(origin)) {
      return new Response("Forbidden: Origin not allowed", {
        status: 403,
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }
    if (request.method === "OPTIONS") {
      return handleCORS(request);
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;
      if (pathname === "/resolve-channel") {
        return await handleResolveChannel(request, env);
      }
      if (pathname === "/fetch-videos") {
        return await handleFetchVideos(request, env);
      }
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
        return createErrorResponse('Missing "url" parameter', 400, request);
      }
      if (!YOUTUBE_RSS_PATTERN.test(targetUrl)) {
        return createErrorResponse(
          "Invalid URL. Only YouTube RSS feeds are allowed.",
          403,
          request
        );
      }
      const response = await fetchWithTimeout(targetUrl, DEFAULT_TIMEOUT_MS, true, CACHE_TTL_SECONDS);
      if (!response.ok) {
        return createErrorResponse(
          `YouTube RSS fetch failed: ${response.status} ${response.statusText}`,
          response.status,
          request
        );
      }
      const xmlText = await response.text();
      if (!xmlText.includes("<?xml") || !xmlText.includes("<feed")) {
        return createErrorResponse("Invalid XML response from YouTube", 502, request);
      }
      const allowedOrigin = getAllowedOrigin(request);
      return new Response(xmlText, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Access-Control-Allow-Origin": allowedOrigin || "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Vary": "Origin",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
          // 5分間キャッシュ
          "X-Proxy-By": "YouTube-List-Tool-Worker"
        }
      });
    } catch (error) {
      console.error("Worker error:", error);
      return createErrorResponse(
        `Proxy error: ${error && error.message ? error.message : String(error)}`,
        500,
        request
      );
    }
  }
};
async function handleFetchVideos(request, env) {
  const allowedOrigin = getAllowedOrigin(request);
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId") || "";
  const limitRaw = url.searchParams.get("limit");
  const startDateRaw = url.searchParams.get("startDate") || "";
  const endDateRaw = url.searchParams.get("endDate") || "";
  const pageTokenInitial = url.searchParams.get("pageToken") || "";
  if (!/^(UC)[0-9A-Za-z_-]{22}$/.test(channelId)) {
    return jsonError(
      {
        code: ERROR_CODES.INVALID_CHANNEL_ID,
        message: "\u30C1\u30E3\u30F3\u30CD\u30EBID\u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059\uFF08UC\u3067\u59CB\u307E\u308B24\u6587\u5B57\uFF09\u3002"
      },
      400,
      allowedOrigin
    );
  }
  const limit = clamp(Number.parseInt(limitRaw || "50", 10), 1, MAX_PAGE_RESULTS);
  let startDate = null;
  let endDate = null;
  if (startDateRaw) {
    startDate = parseISODateStart(startDateRaw);
    if (!startDate) {
      return jsonError(
        { code: ERROR_CODES.BAD_REQUEST, message: "startDate \u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059\uFF08YYYY-MM-DD\uFF09\u3002" },
        400,
        allowedOrigin
      );
    }
  }
  if (endDateRaw) {
    endDate = parseISODateEnd(endDateRaw);
    if (!endDate) {
      return jsonError(
        { code: ERROR_CODES.BAD_REQUEST, message: "endDate \u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059\uFF08YYYY-MM-DD\uFF09\u3002" },
        400,
        allowedOrigin
      );
    }
  }
  if (startDate && endDate && startDate > endDate) {
    return jsonError(
      { code: ERROR_CODES.BAD_REQUEST, message: "startDate \u306F endDate \u4EE5\u524D\u3067\u3042\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059\u3002" },
      400,
      allowedOrigin
    );
  }
  const cacheKeyUrl = new URL("https://cache.youtubelisttool.local/fetch-videos");
  cacheKeyUrl.searchParams.set("channelId", channelId);
  cacheKeyUrl.searchParams.set("limit", String(limit));
  if (startDateRaw) cacheKeyUrl.searchParams.set("startDate", startDateRaw);
  if (endDateRaw) cacheKeyUrl.searchParams.set("endDate", endDateRaw);
  if (pageTokenInitial) cacheKeyUrl.searchParams.set("pageToken", pageTokenInitial);
  const cache = caches.default;
  const cacheRequest = new Request(cacheKeyUrl.toString(), { method: "GET" });
  const cached = await cache.match(cacheRequest);
  if (cached) {
    const body = await cached.arrayBuffer();
    const headers2 = new Headers(cached.headers);
    headers2.set("Access-Control-Allow-Origin", allowedOrigin || "*");
    headers2.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers2.set("Access-Control-Allow-Headers", "Content-Type");
    headers2.set("Vary", "Origin");
    headers2.set("X-Cache", "HIT");
    return new Response(body, { status: cached.status, headers: headers2 });
  }
  const apiKey = getYouTubeApiKey(env);
  if (!apiKey) {
    return jsonError(
      { code: ERROR_CODES.INVALID_KEY, message: "YouTube API \u30AD\u30FC\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002" },
      401,
      allowedOrigin
    );
  }
  const clientKey = `fetch-videos:${getClientKey(request)}`;
  const rateLimit = await checkRateLimit(env, clientKey, 60, 6e4);
  if (rateLimit.limited) {
    return jsonError(
      {
        code: ERROR_CODES.RATE_LIMITED,
        message: "\u30EA\u30AF\u30A8\u30B9\u30C8\u304C\u591A\u3059\u304E\u307E\u3059\u3002\u3057\u3070\u3089\u304F\u3057\u3066\u304B\u3089\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
        retryAfterSec: rateLimit.retryAfterSec
      },
      429,
      allowedOrigin,
      rateLimit.retryAfterSec
    );
  }
  const uploadsPlaylistId = "UU" + channelId.slice(2);
  let pageToken = pageTokenInitial;
  let pageCount = 0;
  let scannedTotal = 0;
  let videos = [];
  let nextPageTokenOut = "";
  let partial = false;
  let earlyStopByDate = false;
  while (pageCount < MAX_PAGES && videos.length < limit) {
    pageCount++;
    const endpoint = "/playlistItems";
    const params = new URLSearchParams();
    params.set("part", "snippet");
    params.set("playlistId", uploadsPlaylistId);
    params.set("maxResults", String(MAX_PAGE_RESULTS));
    if (pageToken) params.set("pageToken", pageToken);
    params.set("fields", "items(snippet(title,publishedAt,resourceId/videoId)),nextPageToken");
    params.set("prettyPrint", "false");
    params.set("key", apiKey);
    const apiRes = await youtubeApiFetchJson(
      endpoint,
      params,
      {
        timeoutMs: FETCH_VIDEOS_TIMEOUT_MS,
        maxRetries: 3,
        request,
        env
      }
    );
    if (apiRes.error) {
      return jsonError(apiRes.error, apiRes.status || 500, allowedOrigin, apiRes.retryAfterSec);
    }
    const data = apiRes.data || {};
    const items = Array.isArray(data.items) ? data.items : [];
    scannedTotal += items.length;
    if (!items.length && !data.nextPageToken) {
      nextPageTokenOut = "";
      partial = false;
      break;
    }
    const pageVideos = [];
    let pageOldestDate = null;
    for (const it of items) {
      const sn = it && it.snippet ? it.snippet : null;
      if (!sn) continue;
      const title = (sn.title || "").trim();
      if (!sn.resourceId || !sn.resourceId.videoId) continue;
      if (title === "Deleted video" || title === "Private video") continue;
      const published = new Date(sn.publishedAt);
      if (isNaN(published.getTime())) continue;
      if (!pageOldestDate || published < pageOldestDate) {
        pageOldestDate = published;
      }
      if (startDate && published < startDate) continue;
      if (endDate && published > endDate) continue;
      pageVideos.push({
        url: `https://www.youtube.com/watch?v=${sn.resourceId.videoId}`,
        title,
        published: published.toISOString()
      });
    }
    for (const v of pageVideos) {
      if (videos.length < limit) videos.push(v);
    }
    if (startDate && pageOldestDate && pageOldestDate < startDate) {
      earlyStopByDate = true;
    }
    if (videos.length >= limit) {
      nextPageTokenOut = data.nextPageToken || "";
      partial = Boolean(nextPageTokenOut);
      break;
    } else if (data.nextPageToken && !earlyStopByDate) {
      pageToken = data.nextPageToken;
      nextPageTokenOut = pageToken;
      partial = true;
      continue;
    } else {
      nextPageTokenOut = "";
      partial = false;
      break;
    }
  }
  let channelTitle = "";
  try {
    const channelParams = new URLSearchParams();
    channelParams.set("part", "snippet");
    channelParams.set("id", channelId);
    channelParams.set("fields", "items(snippet/title)");
    channelParams.set("key", apiKey);
    const channelRes = await youtubeApiFetchJson("/channels", channelParams, {
      timeoutMs: 1e4,
      maxRetries: 2,
      request,
      env
    });
    if (channelRes.data && channelRes.data.items && channelRes.data.items[0]) {
      channelTitle = channelRes.data.items[0].snippet?.title || "";
    }
  } catch (e) {
    console.warn("Failed to fetch channel title:", e);
  }
  const payload = {
    ok: true,
    channelId,
    channelTitle,
    count: videos.length,
    totalFetched: scannedTotal,
    partial,
    nextPageToken: partial ? nextPageTokenOut : "",
    videos
  };
  const jsonText = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowedOrigin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
    "X-Cache": "MISS"
  };
  const response = new Response(jsonText, { status: 200, headers });
  try {
    await cache.put(
      cacheRequest,
      new Response(jsonText, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`
        }
      })
    );
  } catch (e) {
    console.warn("Cache put failed for /fetch-videos:", e && e.message ? e.message : e);
  }
  return response;
}
__name(handleFetchVideos, "handleFetchVideos");
async function handleResolveChannel(request, env) {
  const allowedOrigin = getAllowedOrigin(request);
  const url = new URL(request.url);
  const raw = url.searchParams.get("handle") || url.searchParams.get("q") || url.searchParams.get("url") || url.searchParams.get("id") || "";
  if (!raw) {
    return jsonError(
      { code: ERROR_CODES.BAD_REQUEST, message: "handle\uFF08@\u30CF\u30F3\u30C9\u30EB\u540D\uFF09\u307E\u305F\u306F URL \u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002" },
      400,
      allowedOrigin
    );
  }
  const ucCandidate = extractChannelId(raw);
  if (ucCandidate) {
    return jsonOk(
      {
        ok: true,
        input: raw,
        channelId: ucCandidate
      },
      allowedOrigin
    );
  }
  const handle = extractHandle(raw);
  if (!handle) {
    return jsonError(
      { code: ERROR_CODES.BAD_REQUEST, message: "\u6709\u52B9\u306A @\u30CF\u30F3\u30C9\u30EB \u3092\u62BD\u51FA\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002" },
      400,
      allowedOrigin
    );
  }
  const cacheKeyUrl = new URL("https://cache.youtubelisttool.local/resolve-channel");
  cacheKeyUrl.searchParams.set("handle", handle);
  const cache = caches.default;
  const cacheRequest = new Request(cacheKeyUrl.toString(), { method: "GET" });
  const cached = await cache.match(cacheRequest);
  if (cached) {
    const body = await cached.arrayBuffer();
    const headers = new Headers(cached.headers);
    headers.set("Access-Control-Allow-Origin", allowedOrigin || "*");
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Vary", "Origin");
    headers.set("X-Cache", "HIT");
    return new Response(body, { status: cached.status, headers });
  }
  const apiKey = getYouTubeApiKey(env);
  if (!apiKey) {
    return jsonError(
      { code: ERROR_CODES.INVALID_KEY, message: "YouTube API \u30AD\u30FC\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002" },
      401,
      allowedOrigin
    );
  }
  const clientKey = `resolve-channel:${getClientKey(request)}`;
  const rateLimit = await checkRateLimit(env, clientKey, 120, 6e4);
  if (rateLimit.limited) {
    return jsonError(
      {
        code: ERROR_CODES.RATE_LIMITED,
        message: "\u30EA\u30AF\u30A8\u30B9\u30C8\u304C\u591A\u3059\u304E\u307E\u3059\u3002\u3057\u3070\u3089\u304F\u3057\u3066\u304B\u3089\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
        retryAfterSec: rateLimit.retryAfterSec
      },
      429,
      allowedOrigin,
      rateLimit.retryAfterSec
    );
  }
  const endpoint = "/channels";
  const params = new URLSearchParams();
  params.set("part", "id");
  params.set("forHandle", handle.startsWith("@") ? handle : `@${handle}`);
  params.set("fields", "items(id)");
  params.set("prettyPrint", "false");
  params.set("key", apiKey);
  const apiRes = await youtubeApiFetchJson(
    endpoint,
    params,
    {
      timeoutMs: 15e3,
      maxRetries: 3,
      request,
      env
    }
  );
  if (apiRes.error) {
    return jsonError(apiRes.error, apiRes.status || 500, allowedOrigin, apiRes.retryAfterSec);
  }
  const data = apiRes.data || {};
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length || !items[0] || !items[0].id) {
    return jsonError({ code: ERROR_CODES.NOT_FOUND, message: "\u30C1\u30E3\u30F3\u30CD\u30EB\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002" }, 404, allowedOrigin);
  }
  const channelId = items[0].id;
  const respPayload = {
    ok: true,
    input: raw,
    channelId
  };
  const jsonText = JSON.stringify(respPayload);
  const response = new Response(jsonText, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": allowedOrigin || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
      "X-Cache": "MISS"
    }
  });
  try {
    await cache.put(
      cacheRequest,
      new Response(jsonText, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`
        }
      })
    );
  } catch (e) {
    console.warn("Cache put failed for /resolve-channel:", e && e.message ? e.message : e);
  }
  return response;
}
__name(handleResolveChannel, "handleResolveChannel");
function handleCORS(request) {
  const allowedOrigin = getAllowedOrigin(request);
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    }
  });
}
__name(handleCORS, "handleCORS");
function isOriginAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (PREVIEW_ORIGIN_REGEX.test(origin)) return true;
  return false;
}
__name(isOriginAllowed, "isOriginAllowed");
function getAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin && isOriginAllowed(origin)) return origin;
  return "";
}
__name(getAllowedOrigin, "getAllowedOrigin");
function createErrorResponse(message, status = 500, request) {
  const allowedOrigin = getAllowedOrigin(request);
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": allowedOrigin || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
__name(createErrorResponse, "createErrorResponse");
function jsonError(errorObj, status = 500, allowedOrigin = "", retryAfterSec) {
  const body = JSON.stringify({ ok: false, ...errorObj });
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowedOrigin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
  if (retryAfterSec && Number.isFinite(retryAfterSec)) {
    headers["Retry-After"] = String(Math.max(0, Math.floor(retryAfterSec)));
  }
  return new Response(body, { status, headers });
}
__name(jsonError, "jsonError");
function jsonOk(payload, allowedOrigin = "") {
  const body = JSON.stringify(payload);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": allowedOrigin || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`
    }
  });
}
__name(jsonOk, "jsonOk");
async function fetchWithTimeout(input, timeoutMs = DEFAULT_TIMEOUT_MS, useCache = false, cacheTtlSec = CACHE_TTL_SECONDS, extraInit = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    const req = input instanceof Request ? input : new Request(String(input), {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT
      },
      ...extraInit,
      signal: controller.signal
    });
    if (!useCache) {
      const res2 = await fetch(req, { signal: controller.signal });
      return res2;
    }
    const cache = caches.default;
    const cacheKey = new Request(req.url, { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    const res = await fetch(req, { signal: controller.signal });
    if (res.ok) {
      const headers = new Headers(res.headers);
      headers.set("Cache-Control", `public, max-age=${cacheTtlSec}`);
      const cacheable = new Response(res.body, {
        status: res.status,
        headers
      });
      try {
        await cache.put(cacheKey, cacheable.clone());
      } catch (e) {
        console.warn("Cache put failed:", e && e.message ? e.message : e);
      }
      return cacheable;
    }
    return res;
  } catch (err) {
    if (err && String(err).includes("timeout")) {
      const res = new Response("Upstream timeout", { status: 504 });
      return res;
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}
__name(fetchWithTimeout, "fetchWithTimeout");
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
            "User-Agent": USER_AGENT
          }
        }),
        timeoutMs,
        false
      );
      if (res.status === 504) {
        if (attempt <= maxRetries) {
          await sleep(waitMs);
          waitMs *= 2;
          continue;
        }
        return {
          error: { code: ERROR_CODES.TIMEOUT, message: "YouTube API \u306E\u5FDC\u7B54\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F\u3002" },
          status: 504
        };
      }
      if (res.ok) {
        let data = null;
        try {
          data = await res.json();
        } catch {
          data = {};
        }
        return { data, status: res.status };
      }
      const text = await res.text();
      const errInfo = parseYouTubeApiError(text) || {};
      const reason = errInfo.reason || "";
      const message = errInfo.message || `YouTube API error: ${res.status}`;
      if (res.status === 429) {
        const retryAfterSec = parseRetryAfter(res.headers.get("Retry-After")) || Math.ceil(waitMs / 1e3);
        if (attempt <= maxRetries) {
          await sleep(retryAfterSec * 1e3);
          continue;
        }
        return {
          error: { code: ERROR_CODES.RATE_LIMITED, message: "YouTube API \u306E\u30EC\u30FC\u30C8\u5236\u9650\u306B\u9054\u3057\u307E\u3057\u305F\u3002", retryAfterSec },
          status: 429,
          retryAfterSec
        };
      }
      if (res.status >= 500 && res.status < 600) {
        if (attempt <= maxRetries) {
          await sleep(waitMs);
          waitMs *= 2;
          continue;
        }
        return {
          error: { code: ERROR_CODES.BAD_REQUEST, message: "YouTube API \u3067\u30B5\u30FC\u30D0\u30FC\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u3002" },
          status: res.status
        };
      }
      if (res.status === 403) {
        if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
          return {
            error: { code: ERROR_CODES.QUOTA_EXCEEDED, message: "YouTube API \u306E\u30AF\u30A9\u30FC\u30BF\u3092\u8D85\u904E\u3057\u307E\u3057\u305F\u3002" },
            status: 403
          };
        }
        if (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
          if (attempt <= maxRetries) {
            await sleep(waitMs);
            waitMs *= 2;
            continue;
          }
          return {
            error: { code: ERROR_CODES.RATE_LIMITED, message: "YouTube API \u306E\u30EC\u30FC\u30C8\u5236\u9650\u306B\u9054\u3057\u307E\u3057\u305F\u3002" },
            status: 429
          };
        }
        return {
          error: { code: ERROR_CODES.BAD_REQUEST, message: message || "\u30A2\u30AF\u30BB\u30B9\u304C\u62D2\u5426\u3055\u308C\u307E\u3057\u305F\u3002" },
          status: 403
        };
      }
      if (res.status === 401) {
        return { error: { code: ERROR_CODES.INVALID_KEY, message: "YouTube API \u30AD\u30FC\u304C\u7121\u52B9\u3067\u3059\u3002" }, status: 401 };
      }
      if (res.status === 404) {
        return { error: { code: ERROR_CODES.NOT_FOUND, message: "\u5BFE\u8C61\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002" }, status: 404 };
      }
      if (res.status === 400) {
        return {
          error: {
            code: ERROR_CODES.BAD_REQUEST,
            message: message || "\u4E0D\u6B63\u306A\u30EA\u30AF\u30A8\u30B9\u30C8\u3067\u3059\u3002"
          },
          status: 400
        };
      }
      return { error: { code: ERROR_CODES.BAD_REQUEST, message }, status: res.status };
    } catch (e) {
      if (attempt <= maxRetries) {
        await sleep(waitMs);
        waitMs *= 2;
        continue;
      }
      return {
        error: { code: ERROR_CODES.BAD_REQUEST, message: "YouTube API \u306E\u547C\u3073\u51FA\u3057\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" },
        status: 502
      };
    }
  }
  return {
    error: { code: ERROR_CODES.BAD_REQUEST, message: "YouTube API \u306E\u547C\u3073\u51FA\u3057\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" },
    status: 502
  };
}
__name(youtubeApiFetchJson, "youtubeApiFetchJson");
async function checkRateLimit(env, key, limit, windowMs) {
  try {
    if (!env || !env.RATE_LIMITER) {
      return { limited: false, remaining: Number.MAX_SAFE_INTEGER, retryAfterSec: 0 };
    }
    const id = env.RATE_LIMITER.idFromName(key);
    const stub = env.RATE_LIMITER.get(id);
    const resp = await stub.fetch(`http://limit/?key=${encodeURIComponent(key)}&limit=${limit}&windowMs=${windowMs}`);
    const data = await resp.json();
    return {
      limited: !!data.limited,
      remaining: typeof data.remaining === "number" ? data.remaining : 0,
      retryAfterSec: typeof data.retryAfterSec === "number" ? data.retryAfterSec : 0
    };
  } catch (e) {
    console.warn("RateLimiter check failed:", e && e.message ? e.message : e);
    return { limited: false, remaining: Number.MAX_SAFE_INTEGER, retryAfterSec: 0 };
  }
}
__name(checkRateLimit, "checkRateLimit");
function parseYouTubeApiError(text) {
  try {
    const obj = JSON.parse(text);
    if (obj && obj.error) {
      const e = obj.error;
      if (Array.isArray(e.errors) && e.errors[0]) {
        return { message: e.message || "", reason: e.errors[0].reason || "" };
      }
      if (e.status && e.message) {
        const reason = Array.isArray(e.details) && e.details.find((d) => Array.isArray(d.errors) && d.errors[0] && d.errors[0].reason)?.errors?.[0]?.reason || "";
        return { message: e.message, reason };
      }
      return { message: e.message || "YouTube API error", reason: "" };
    }
  } catch {
  }
  return null;
}
__name(parseYouTubeApiError, "parseYouTubeApiError");
function parseRetryAfter(v) {
  if (!v) return 0;
  const sec = Number.parseInt(v, 10);
  if (Number.isFinite(sec)) return Math.max(0, sec);
  const date = new Date(v);
  if (!isNaN(date.getTime())) {
    const now = Date.now();
    return Math.max(0, Math.ceil((date.getTime() - now) / 1e3));
  }
  return 0;
}
__name(parseRetryAfter, "parseRetryAfter");
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
__name(sleep, "sleep");
function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}
__name(clamp, "clamp");
function parseISODateStart(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = /* @__PURE__ */ new Date(`${s}T00:00:00.000Z`);
  if (isNaN(d.getTime())) return null;
  return d;
}
__name(parseISODateStart, "parseISODateStart");
function parseISODateEnd(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = /* @__PURE__ */ new Date(`${s}T23:59:59.999Z`);
  if (isNaN(d.getTime())) return null;
  return d;
}
__name(parseISODateEnd, "parseISODateEnd");
function extractHandle(raw) {
  const s = String(raw).trim();
  try {
    const u = new URL(s);
    const m = u.pathname.match(/\/@?([^/]+)/);
    if (m && m[1]) {
      return m[0].startsWith("/@") ? `@${m[1]}` : `@${m[1]}`;
    }
  } catch {
  }
  if (s.startsWith("@")) return s;
  if (/^[A-Za-z0-9._-]+$/.test(s)) return `@${s}`;
  return "";
}
__name(extractHandle, "extractHandle");
function extractChannelId(raw) {
  const s = String(raw).trim();
  if (/^(UC)[0-9A-Za-z_-]{22}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const qId = u.searchParams.get("channel") || u.searchParams.get("channel_id");
    if (qId && /^(UC)[0-9A-Za-z_-]{22}$/.test(qId)) return qId;
    const m = u.pathname.match(/\/channel\/(UC[0-9A-Za-z_-]{22})/);
    if (m && m[1]) return m[1];
  } catch {
  }
  return "";
}
__name(extractChannelId, "extractChannelId");
function getClientKey(request) {
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
  const origin = request.headers.get("Origin") || "";
  return `${ip}:${origin}`;
}
__name(getClientKey, "getClientKey");
function getYouTubeApiKey(env) {
  return env && (env.YT_API_KEY || env.YOUTUBE_API_KEY || env.GOOGLE_API_KEY);
}
__name(getYouTubeApiKey, "getYouTubeApiKey");
var RateLimiter = class {
  static {
    __name(this, "RateLimiter");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const key = url.searchParams.get("key") || "global";
      const limit = clamp(Number.parseInt(url.searchParams.get("limit") || "60", 10), 1, 1e5);
      const windowMs = clamp(Number.parseInt(url.searchParams.get("windowMs") || "60000", 10), 100, 864e5);
      const now = Date.now();
      const storageKey = `rl:${key}`;
      let data = await this.state.storage.get(storageKey);
      if (!data || typeof data !== "object") {
        data = { windowStart: now, count: 0 };
      }
      let { windowStart, count } = data;
      if (now - windowStart >= windowMs) {
        windowStart = now;
        count = 0;
      }
      count += 1;
      await this.state.storage.put(storageKey, { windowStart, count });
      let limited = false;
      let retryAfterSec = 0;
      if (count > limit) {
        limited = true;
        const resetInMs = windowMs - (now - windowStart);
        retryAfterSec = Math.max(0, Math.ceil(resetInMs / 1e3));
      }
      const remaining = Math.max(0, limit - count);
      return new Response(
        JSON.stringify({ limited, remaining, retryAfterSec }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
          }
        }
      );
    } catch (e) {
      return new Response(
        JSON.stringify({
          limited: false,
          remaining: 0,
          retryAfterSec: 0,
          error: String(e && e.message ? e.message : e)
        }),
        { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }
  }
};

// ../../../../../../../home/littl/.nvm/versions/node/v22.19.0/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../../../home/littl/.nvm/versions/node/v22.19.0/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError2;

// .wrangler/tmp/bundle-tMlVQF/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = youtube_proxy_default;

// ../../../../../../../home/littl/.nvm/versions/node/v22.19.0/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-tMlVQF/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  RateLimiter,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=youtube-proxy.js.map
