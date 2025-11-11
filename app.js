// ===== ダークモード管理 =====

/**
 * テーマを設定する
 * @param {string} theme - 'light' または 'dark'
 * @param {boolean} saveToStorage - localStorageに保存するか（デフォルト: true）
 */
function setTheme(theme, saveToStorage = true) {
  const root = document.documentElement;
  const themeIcon = document.getElementById('themeIcon');

  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
    if (themeIcon) themeIcon.textContent = '☀️';
  } else {
    root.setAttribute('data-theme', 'light');
    if (themeIcon) themeIcon.textContent = '🌙';
  }

  // localStorageに保存（手動設定の場合のみ）
  if (saveToStorage) {
    localStorage.setItem('theme', theme);
  }
}

/**
 * テーマを切り替える（ユーザーの手動操作）
 */
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme, true); // 手動設定なので保存する
}

/**
 * 保存されたテーマまたはシステム設定を読み込む
 */
function initTheme() {
  // localStorageから読み込み
  const savedTheme = localStorage.getItem('theme');

  if (savedTheme) {
    // 保存されたテーマを適用（localStorageには再保存しない）
    setTheme(savedTheme, false);
  } else {
    // システム設定を検出（localStorageには保存しない）
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light', false);
  }
}

// ページ読み込み時にテーマを初期化（即座に実行してちらつき防止）
initTheme();

// システム設定の変更を監視
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  // ユーザーが手動で設定していない場合のみ、システム設定に追従
  if (!localStorage.getItem('theme')) {
    setTheme(e.matches ? 'dark' : 'light', false);
  }
});

// ===== 定数定義 =====

// CORS Proxy 設定
// 優先順位: 自前Worker > allorigins.win > corsproxy.io
const PROXY_CONFIG = [
  {
    name: 'Custom Worker',
    url: 'http://localhost:8787/?url=',
    timeout: 10000,
    enabled: true // ローカルテスト用に localhost を使用
  },
  {
    name: 'AllOrigins',
    url: 'https://api.allorigins.win/raw?url=',
    timeout: 10000,
    enabled: true
  },
  {
    name: 'CorsProxy',
    url: 'https://corsproxy.io/?',
    timeout: 10000,
    enabled: true
  }
];

const CHANNEL_ID_REGEX = /^UC[\w-]{22}$/;
const CHANNEL_URL_REGEX = /youtube\.com\/channel\/(UC[\w-]{22})/;
const CONCURRENCY_LIMIT = 3; // 同時実行数の制限
const DEFAULT_LIMIT = 15;

// エクスポート用のデータ保持
let lastFetchedData = null;

// エラーメッセージの定数化
const ERROR_MESSAGES = {
  EMPTY_LINE: '空行',
  INVALID_AT: '@username 形式は非対応です。チャンネルID（UC...）を使用してください。YouTubeのチャンネルページを開き、URLから「UC...」の部分をコピーしてください。',
  INVALID_C: '/c/ 形式は廃止されました。チャンネルID（UC...）を使用してください。',
  INVALID_FORMAT: '不正な形式です。チャンネルID（UC...）または /channel/UC... を入力してください。',
  INPUT_REQUIRED: 'チャンネルIDまたはURLを入力してください。',
  ALL_FAILED: '全てのチャンネルで取得に失敗しました。入力内容を確認してください。',
  TIMEOUT: '接続がタイムアウトしました。インターネット接続を確認するか、時間をおいて再試行してください。',
  PROXY_UNAVAILABLE: 'CORS Proxyサービスが一時的に利用できません。レート制限に達している可能性があります。15分ほど待ってから再試行してください。',
  INVALID_XML: 'チャンネルが存在しないか、RSSフィードの取得に失敗しました。チャンネルIDが正しいか確認してください。',
  CHANNEL_MISMATCH: 'セキュリティエラー: 要求したチャンネルとRSSの発信元が一致しません',
  INVALID_URL: 'セキュリティエラー: 不正な動画URLを検出しました',
  CHANNEL_NAME_UNKNOWN: 'チャンネル名不明',
  TITLE_UNKNOWN: 'タイトル不明',
  API_QUOTA_EXCEEDED: '1日の無料枠（10,000クォータ）を超過しました。\n・明日（太平洋時間の深夜0時）にリセットされます\n・または件数を減らして再試行してください',
  API_RATE_LIMIT: 'APIのレート制限に達しました。数分後に再試行してください。',
  API_INVALID_KEY: 'サーバー設定エラーが発生しました。管理者に連絡してください。',
  API_CHANNEL_NOT_FOUND: 'チャンネルが見つかりませんでした。チャンネルIDが正しいか確認してください。'
};

// UI要素のキャッシュ（DOMへの参照を一元管理）
const UI = {
  get fetchButton() { return document.getElementById('fetchButton'); },
  get loading() { return document.getElementById('loading'); },
  get loadingText() { return document.getElementById('loadingText'); },
  get results() { return document.getElementById('results'); },
  get errors() { return document.getElementById('errors'); },
  get channelInput() { return document.getElementById('channelInput'); },
  get limitSelect() { return document.getElementById('limitSelect'); },
  get exportButtons() { return document.getElementById('exportButtons'); },
  get startDate() { return document.getElementById('startDate'); },
  get endDate() { return document.getElementById('endDate'); },
  get clearDates() { return document.getElementById('clearDates'); },

  // 段階的ロード/キャンセル用UI
  get progressContainer() { return document.getElementById('progressContainer'); },
  get progressBar() { return document.getElementById('progressBar'); },
  get progressText() { return document.getElementById('progressText'); },
  get cancelButton() { return document.getElementById('cancelButton'); },
  get loadMoreButton() { return document.getElementById('loadMoreButton'); }
};

// 段階的ロード用の状態管理
let loadingState = {
  isLoading: false,
  isCancelled: false,
  abortController: null,
  currentChannels: [],
  allVideos: [],
  nextPageTokens: {},
  hasMore: false,
};

// ===== UI状態管理ヘルパー =====

/**
 * ローディング状態を設定
 * @param {boolean} isLoading - ローディング中かどうか
 * @param {string} progressText - プログレステキスト（オプション）
 */
function setLoadingState(isLoading, progressText = '取得中...') {
  UI.fetchButton.disabled = isLoading;
  UI.loading.toggleAttribute('hidden', !isLoading);
  if (isLoading && UI.loadingText) {
    UI.loadingText.textContent = progressText;
  }
}

/**
 * 出力エリアをクリア
 */
function clearOutputs() {
  UI.results.textContent = '';
  UI.errors.textContent = '';
  if (UI.exportButtons) {
    UI.exportButtons.style.display = 'none';
  }
}

/**
 * 取得件数をパースして検証
 * @param {string} value - select要素の値
 * @returns {number} - 取得件数
 */
function parseLimit(value) {
  const limitValue = parseInt(value, 10);
  return Number.isFinite(limitValue) ? limitValue : DEFAULT_LIMIT;
}

// ===== 日付処理ユーティリティ =====

/**
 * ローカル日付文字列をローカル深夜0時のDateオブジェクトに変換
 * @param {string} yyyyMmDd - 'YYYY-MM-DD' 形式の日付文字列
 * @returns {Date} - ローカルタイムゾーンの深夜0:00
 */
function parseLocalDateOnly(yyyyMmDd) {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return new Date(y, m - 1, d); // ローカル深夜0:00
}

/**
 * 日付範囲を検証・取得
 * @returns {{ startDate: Date|null, endDate: Date|null, error: string|null }}
 */
function getDateRange() {
  const startValue = UI.startDate?.value || '';
  const endValue = UI.endDate?.value || '';

  // 両方空欄の場合はフィルタなし
  if (!startValue && !endValue) {
    return { startDate: null, endDate: null, error: null };
  }

  let startDate = null;
  let endDate = null;

  // 開始日の処理（ローカル深夜0:00）
  if (startValue) {
    startDate = parseLocalDateOnly(startValue);
    if (Number.isNaN(startDate.getTime())) {
      return { startDate: null, endDate: null, error: '開始日が不正です。' };
    }
  }

  // 終了日の処理（ローカル 23:59:59.999）
  if (endValue) {
    const endLocalMidnightNext = parseLocalDateOnly(endValue);
    endLocalMidnightNext.setDate(endLocalMidnightNext.getDate() + 1);
    endDate = new Date(endLocalMidnightNext.getTime() - 1); // 23:59:59.999
    if (Number.isNaN(endDate.getTime())) {
      return { startDate: null, endDate: null, error: '終了日が不正です。' };
    }
  }

  // 開始日 > 終了日 のチェック
  if (startDate && endDate && startDate > endDate) {
    return {
      startDate: null,
      endDate: null,
      error: '開始日は終了日より前の日付を指定してください。'
    };
  }

  return { startDate, endDate, error: null };
}

// ===== ユーティリティ関数 =====

/**
 * タイムアウト付き fetch（AbortController 使用）
 */
function fetchWithTimeout(url, timeout) {
  const controller = new AbortController();
  const signal = controller.signal;

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return fetch(url, { signal })
    .catch(error => {
      // Abort エラーを分かりやすいメッセージに変換
      if (error.name === 'AbortError') {
        throw new Error(ERROR_MESSAGES.TIMEOUT);
      }
      throw error;
    })
    .finally(() => clearTimeout(timeoutId));
}

/**
 * チャンネルタイトルを切り捨て（サロゲートペア対応）
 */
function truncateTitle(title, maxLength = 30) {
  if (!title || title.length === 0) {
    return ERROR_MESSAGES.CHANNEL_NAME_UNKNOWN;
  }

  // サロゲートペアを考慮した文字列分割
  const chars = [...title];

  if (chars.length <= maxLength) {
    return title;
  }

  return chars.slice(0, maxLength).join('') + '...';
}

// ===== 入力正規化 =====

/**
 * @username をチャンネルIDに解決（Workers経由）
 * @param {string} username - @username（例: @mkbhd）
 * @returns {Promise<{ success: boolean, channelId?: string, error?: string }>}
 */
async function resolveUsername(username) {
  try {
    const cleanUsername = username.replace(/^@/, '');
    const workerUrl = PROXY_CONFIG.find(proxy => proxy.name === 'Custom Worker' && proxy.enabled);

    if (!workerUrl) {
      return {
        success: false,
        error: '@username の解決には Custom Worker が必要です。設定を確認してください。'
      };
    }

    // Workers の /resolve-channel エンドポイントを呼ぶ
    const apiUrl = workerUrl.url.replace('/?url=', '/resolve-channel') + `?username=${encodeURIComponent(cleanUsername)}`;

    const response = await fetchWithTimeout(apiUrl, 10000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || `@${cleanUsername} のチャンネルが見つかりませんでした。`
      };
    }

    const data = await response.json();

    if (!data.channelId) {
      return {
        success: false,
        error: `@${cleanUsername} のチャンネルIDを取得できませんでした。`
      };
    }

    return { success: true, channelId: data.channelId };

  } catch (error) {
    console.error('Username resolution error:', error);
    return {
      success: false,
      error: `@username の解決中にエラーが発生しました: ${error.message}`
    };
  }
}

/**
 * 入力を正規化してチャンネルIDを抽出
 * @param {string} input - ユーザー入力
 * @returns {Promise<{ success: boolean, channelId?: string, error?: string }>}
 */
async function normalizeInput(input) {
  const trimmed = input.trim();

  // 空行チェック
  if (trimmed.length === 0) {
    return { success: false, error: ERROR_MESSAGES.EMPTY_LINE };
  }

  // UC... 形式の直接入力
  if (CHANNEL_ID_REGEX.test(trimmed)) {
    return { success: true, channelId: trimmed };
  }

  // /channel/UC... 形式のURL
  const urlMatch = trimmed.match(CHANNEL_URL_REGEX);
  if (urlMatch) {
    return { success: true, channelId: urlMatch[1] };
  }

  // @username 形式の処理（Workers経由で解決）
  if (trimmed.includes('@')) {
    return await resolveUsername(trimmed);
  }

  // 非対応形式
  if (trimmed.includes('/c/')) {
    return { success: false, error: ERROR_MESSAGES.INVALID_C };
  }

  return { success: false, error: ERROR_MESSAGES.INVALID_FORMAT };
}

// ===== CORS Proxy フェッチ（フォールバック対応）=====

/**
 * CORS Proxy 経由でフェッチ（全エラーでフォールバック）
 * @param {string} targetUrl - 取得対象のURL
 * @param {number} proxyIndex - 現在のProxy インデックス
 * @returns {Promise<string>} - レスポンステキスト
 */
async function fetchWithProxy(targetUrl, proxyIndex = 0) {
  // 有効なProxyのみをフィルタリング
  const enabledProxies = PROXY_CONFIG.filter(p => p.enabled);

  if (proxyIndex >= enabledProxies.length) {
    throw new Error(ERROR_MESSAGES.PROXY_UNAVAILABLE);
  }

  const proxy = enabledProxies[proxyIndex];
  const encodedUrl = encodeURIComponent(targetUrl);
  const proxiedUrl = proxy.url + encodedUrl;

  try {
    const response = await fetchWithTimeout(proxiedUrl, proxy.timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();

    // HTML エラーページを検出
    if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
      throw new Error('Proxy returned HTML error page');
    }

    console.log(`✓ ${proxy.name} succeeded`);
    return text;

  } catch (error) {
    console.warn(`✗ ${proxy.name} (${proxyIndex + 1}/${enabledProxies.length}) failed:`, error.message);
    return fetchWithProxy(targetUrl, proxyIndex + 1);
  }
}

// ===== API 取得（段階的ロード対応） =====

/**
 * Workers の /fetch-videos エンドポイントを経由して動画一覧を取得
 * @param {string} channelId - チャンネルID
 * @param {number} limit - 取得件数（ページサイズとして扱う）
 * @param {{ startDate: Date|null, endDate: Date|null }} dateRange - 日付範囲
 * @param {string|null} pageToken - 次ページトークン
 * @returns {Promise<{ videos: Array, channelTitle: string, nextPageToken: string|null, partial: boolean }>}
 */
async function fetchChannelVideosAPI(channelId, limit, dateRange = {}, pageToken = null) {
  const worker = PROXY_CONFIG.find(p => p.name === 'Custom Worker' && p.enabled);
  if (!worker) {
    throw new Error('APIモードには Custom Worker が必要です。設定を確認してください。');
  }

  const base = worker.url.replace('/?url=', '/fetch-videos');
  const params = new URLSearchParams();
  params.set('channelId', channelId);
  // ページサイズとして扱う（YouTube APIの上限に配慮して最大50に制限）
  params.set('limit', String(Math.max(16, Math.min(50, limit || 50))));
  if (dateRange?.startDate) params.set('startDate', new Date(dateRange.startDate).toISOString());
  if (dateRange?.endDate) params.set('endDate', new Date(dateRange.endDate).toISOString());
  if (pageToken) params.set('pageToken', pageToken);

  // キャンセル対応
  const controller = new AbortController();
  loadingState.abortController = controller;

  let response;
  try {
    response = await fetch(`${base}?${params.toString()}`, { signal: controller.signal });
  } catch (e) {
    if (e.name === 'AbortError' || loadingState.isCancelled) {
      throw new Error('操作はキャンセルされました。');
    }
    throw e;
  }

  let data;
  try {
    data = await response.json();
  } catch (_) {
    throw new Error('サーバーからの応答を解析できませんでした。');
  }

  if (!response.ok) {
    const code = data?.code || data?.error?.code || data?.error;
    switch (code) {
      case 'quota_exceeded':
      case 'dailyLimitExceeded':
      case 'quotaExceeded':
        throw new Error(ERROR_MESSAGES.API_QUOTA_EXCEEDED);
      case 'rate_limit':
      case 'rateLimitExceeded':
        throw new Error(ERROR_MESSAGES.API_RATE_LIMIT);
      case 'invalid_key':
      case 'forbidden':
      case 'invalidApiKey':
        throw new Error(ERROR_MESSAGES.API_INVALID_KEY);
      case 'channel_not_found':
      case 'notFound':
        throw new Error(ERROR_MESSAGES.API_CHANNEL_NOT_FOUND);
      default:
        throw new Error(data?.message || data?.error?.message || `APIエラー: ${response.status}`);
    }
  }

  const videos = Array.isArray(data?.videos) ? data.videos : [];
  const channelTitle = data?.channelTitle || data?.channel?.title || ERROR_MESSAGES.CHANNEL_NAME_UNKNOWN;
  const nextPageToken = data?.nextPageToken ?? null;
  const partial = Boolean(nextPageToken);

  // XSS対策: URLの妥当性チェック
  const urlsAreYoutube = videos.every(v => typeof v.url === 'string' && v.url.startsWith('https://www.youtube.com/watch?v='));
  if (!urlsAreYoutube) {
    throw new Error(ERROR_MESSAGES.INVALID_URL);
  }

  return { videos, channelTitle, nextPageToken, partial };
}

/**
 * プログレスバーとキャンセルボタンを表示
 * @param {number} current - 処理済みチャンネル数
 * @param {number} total - 合計チャンネル数
 * @param {string} channelName - 現在処理中のチャンネル名
 */
function showProgressWithCancel(current, total, channelName = '') {
  if (UI.progressContainer) UI.progressContainer.hidden = false;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  if (UI.progressBar) UI.progressBar.style.width = `${percent}%`;
  if (UI.progressText) UI.progressText.textContent = `取得中... ${current}/${total}${channelName ? ` - ${truncateTitle(channelName, 40)}` : ''}`;
  if (UI.cancelButton) UI.cancelButton.disabled = false;
  loadingState.isLoading = true;
}

/**
 * プログレス表示を非表示
 */
function hideProgress() {
  if (UI.progressContainer) UI.progressContainer.hidden = true;
  if (UI.progressBar) UI.progressBar.style.width = '0%';
  if (UI.progressText) UI.progressText.textContent = '';
  loadingState.isLoading = false;
}

/**
 * キャンセルボタン・ハンドラー
 */
function handleCancel() {
  loadingState.isCancelled = true;
  if (UI.cancelButton) UI.cancelButton.disabled = true;
  if (UI.progressText) UI.progressText.textContent = 'キャンセル中...';
  try {
    loadingState.abortController?.abort();
  } catch (_) {
    // ignore
  }
}

/**
 * さらに読み込むボタンの表示/残り数更新
 */
function updateLoadMoreButton() {
  const remaining = Object.values(loadingState.nextPageTokens || {}).filter(Boolean).length;
  loadingState.hasMore = remaining > 0;
  if (!UI.loadMoreButton) return;
  if (remaining > 0) {
    UI.loadMoreButton.style.display = '';
    UI.loadMoreButton.textContent = `さらに読み込む（残り ${remaining} チャンネル）`;
    UI.loadMoreButton.disabled = false;
  } else {
    UI.loadMoreButton.style.display = 'none';
  }
}

/**
 * nextPageToken を使って全チャンネルの追加読み込み
 */
async function loadMoreVideos() {
  if (!loadingState.hasMore || loadingState.isLoading) return;
  const remainingChannelIds = Object.keys(loadingState.nextPageTokens).filter(cid => !!loadingState.nextPageTokens[cid]);
  if (remainingChannelIds.length === 0) {
    updateLoadMoreButton();
    return;
  }

  const limit = parseLimit(UI.limitSelect?.value || `${DEFAULT_LIMIT}`);
  const dateRange = getDateRange();

  loadingState.isCancelled = false;
  let completed = 0;
  const total = remainingChannelIds.length;

  try {
    for (const channelId of remainingChannelIds) {
      if (loadingState.isCancelled) break;
      const pageToken = loadingState.nextPageTokens[channelId];

      // APIフェッチ
      const chunk = await fetchChannelVideosAPI(channelId, limit, dateRange, pageToken);

      // 状態更新: 動画の追記
      let channelData = loadingState.allVideos.find(c => c.channelId === channelId);
      if (!channelData) {
        // 念のため存在しないケースもケア
        channelData = { channelId, channelTitle: chunk.channelTitle, videos: [] };
        loadingState.allVideos.push(channelData);
      }
      const existingUrls = new Set(channelData.videos.map(v => v.url));
      const newOnes = chunk.videos.filter(v => !existingUrls.has(v.url));
      channelData.videos.push(...newOnes);
      channelData.channelTitle = chunk.channelTitle || channelData.channelTitle;

      // nextPageToken 更新
      loadingState.nextPageTokens[channelId] = chunk.nextPageToken || null;

      // 画面更新（該当チャンネルのみ）
      renderResults([{ channelId, channelTitle: channelData.channelTitle, videos: channelData.videos }], channelId);

      // 進捗表示
      completed += 1;
      showProgressWithCancel(completed, total, channelData.channelTitle);

      if (loadingState.isCancelled) break;
    }
  } catch (e) {
    showGlobalError(e);
  } finally {
    hideProgress();
    updateLoadMoreButton();

    // エクスポート用に集約データを保存
    lastFetchedData = loadingState.allVideos.map(({ channelTitle, videos }) => ({ channelTitle, videos }));
  }
}

// ===== RSS 取得・パース =====

/**
 * XMLノードからテキストを取得するヘルパー
 * @param {Element} parent - 親要素
 * @param {string} selector - セレクタ
 * @param {string} fallback - デフォルト値
 * @returns {string} - テキスト内容
 */
function getNodeText(parent, selector, fallback = '') {
  return parent.querySelector(selector)?.textContent || fallback;
}

/**
 * XMLエントリーを動画オブジェクトに変換
 * @param {Element} entry - エントリー要素
 * @returns {{ url: string, title: string, published: string }}
 */
function entryToVideo(entry) {
  const videoId = getNodeText(entry, 'videoId');
  return {
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: getNodeText(entry, 'title', ERROR_MESSAGES.TITLE_UNKNOWN),
    published: getNodeText(entry, 'published')
  };
}

/**
 * チャンネルの動画情報を取得（日付フィルター対応）
 * 15件以下はRSS、16件以上はAPIに自動切り替え
 * @param {string} channelId - チャンネルID
 * @param {number} limit - 取得件数の上限
 * @param {{ startDate: Date|null, endDate: Date|null }} dateRange - 日付範囲
 * @returns {Promise<{ videos: Array, channelTitle: string, filteredCount: number, nextPageToken: string|null, partial: boolean }>}
 */
async function fetchChannelVideos(channelId, limit, dateRange = {}) {
  // APIモード（16件以上）
  if (limit > 15) {
    const apiResult = await fetchChannelVideosAPI(channelId, limit, dateRange, null);
    return {
      videos: apiResult.videos,
      channelTitle: apiResult.channelTitle,
      filteredCount: 0,
      nextPageToken: apiResult.nextPageToken || null,
      partial: Boolean(apiResult.nextPageToken)
    };
  }

  // RSSモード（15件以下：既存ロジック）
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  try {
    const xmlText = await fetchWithProxy(rssUrl);

    // XML パースエラーで判定（Content-Type 検証は不要）
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');

    // パースエラーチェック
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error(ERROR_MESSAGES.INVALID_XML);
    }

    // チャンネルID検証（セキュリティ: RSS改ざん対策）
    const feedChannelId = doc.querySelector('yt\\:channelId')?.textContent;
    if (feedChannelId && feedChannelId !== channelId) {
      throw new Error(ERROR_MESSAGES.CHANNEL_MISMATCH);
    }

    // チャンネルタイトル取得
    const channelTitle = getNodeText(doc, 'feed > title', ERROR_MESSAGES.CHANNEL_NAME_UNKNOWN);

    // 動画エントリー取得
    const entries = Array.from(doc.querySelectorAll('entry'));

    // 日付フィルタリング + 早期停止
    const videos = [];
    const startTs = dateRange.startDate?.getTime();
    const endTs = dateRange.endDate?.getTime();
    let filteredCount = 0;

    for (const entry of entries) {
      // 取得上限チェック
      if (videos.length >= limit) {
        break;
      }

      // 先に公開日だけを取得（軽量）
      const publishedStr = getNodeText(entry, 'published');
      const ts = Date.parse(publishedStr);

      if (Number.isNaN(ts)) {
        filteredCount++;
        continue;
      }

      // 早期停止: 開始日より古い動画が出たら終了
      if (startTs != null && ts < startTs) {
        break;
      }

      // 範囲チェック
      const inRange = (
        (startTs == null || ts >= startTs) &&
        (endTs == null || ts <= endTs)
      );

      if (inRange) {
        videos.push(entryToVideo(entry)); // 範囲内のみ変換
      } else {
        filteredCount++;
      }
    }

    // URL検証（セキュリティ: 不正なURL検出）
    const urlsAreYoutube = videos.every(v => v.url.startsWith('https://www.youtube.com/watch?v='));
    if (!urlsAreYoutube) {
      throw new Error(ERROR_MESSAGES.INVALID_URL);
    }

    return { videos, channelTitle, filteredCount, nextPageToken: null, partial: false };

  } catch (error) {
    throw new Error(`取得失敗: ${error.message}`);
  }
}

// ===== UI 更新 =====

/**
 * 結果を表示（channelId 指定時は当該セクションのみ更新）
 * @param {Array<{channelId?: string, channelTitle: string, videos: Array}>} resultsData
 * @param {string|null} channelId - 更新対象チャンネルID（省略時は全再描画）
 */
function renderResults(resultsData, channelId = null) {
  // 全体再描画時のみクリア
  if (!channelId) {
    UI.results.textContent = '';
  }

  // セクション構築・更新ヘルパー
  const upsertSection = (data) => {
    const cid = data.channelId || '';
    const selector = cid ? `.channel-section[data-channel-id="${cid}"]` : null;
    const existing = selector ? UI.results.querySelector(selector) : null;

    // セクション要素（新規または置換用）
    const section = document.createElement('div');
    section.className = 'channel-section';
    if (cid) section.setAttribute('data-channel-id', cid);

    // ヘッダー
    const header = document.createElement('div');
    header.className = 'channel-header';
    header.textContent = truncateTitle(data.channelTitle);
    section.appendChild(header);

    // 配列を1回だけ走査して3つの文字列を生成（パフォーマンス改善）
    const aggregated = data.videos.reduce((acc, video) => {
      acc.urls.push(video.url);
      acc.titles.push(video.title);
      acc.dates.push(video.published);
      return acc;
    }, { urls: [], titles: [], dates: [] });

    // URLs ブロック
    const urlsBlock = createOutputBlock('URLs', aggregated.urls.join('\n'));
    section.appendChild(urlsBlock);

    // Titles ブロック
    const titlesBlock = createOutputBlock('Titles', aggregated.titles.join('\n'));
    section.appendChild(titlesBlock);

    // Published Dates ブロック
    const datesBlock = createOutputBlock('Published Dates', aggregated.dates.join('\n'));
    section.appendChild(datesBlock);

    if (existing) {
      existing.replaceWith(section);
    } else {
      UI.results.appendChild(section);
    }
  };

  if (channelId) {
    // 単一セクション更新
    const item = resultsData.find(r => r.channelId === channelId) || (() => {
      // フォールバック: 内部状態から再構築
      const stateItem = loadingState.allVideos.find(c => c.channelId === channelId);
      if (!stateItem) return null;
      return { channelId, channelTitle: stateItem.channelTitle, videos: stateItem.videos };
    })();
    if (item) upsertSection(item);
  } else {
    // 全再描画
    resultsData.forEach(upsertSection);
  }
}

/**
 * 出力ブロックを作成（XSS対策: textContent のみ使用）
 */
function createOutputBlock(title, content) {
  const block = document.createElement('div');
  block.className = 'output-block';

  const heading = document.createElement('h3');
  heading.textContent = `# ${title}`;
  block.appendChild(heading);

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = content; // innerHTML 禁止
  pre.appendChild(code);
  block.appendChild(pre);

  return block;
}

/**
 * エラー要素を作成（コンポーネント化）
 * @param {{ message: string, prefix?: string }} options - メッセージとプレフィックス
 * @returns {HTMLElement} - エラー要素
 */
function createErrorItem({ message, prefix = 'エラー: ' }) {
  const errorItem = document.createElement('div');
  errorItem.className = 'error-item';

  const strong = document.createElement('strong');
  strong.textContent = prefix;
  errorItem.appendChild(strong);

  errorItem.appendChild(document.createTextNode(message));
  return errorItem;
}

/**
 * エラーメッセージを生成（グループ化対応）
 * @param {{ error: string, inputs: Array, count: number }} group - エラーグループ
 * @returns {string} - メッセージ
 */
function formatErrorMessage(group) {
  return group.count > 1
    ? `${group.error} (${group.count}件)`
    : `${group.inputs[0]} - ${group.error}`;
}

/**
 * エラーを表示（同一エラーを集約）
 */
function renderErrors(errorsData) {
  // 同一エラーメッセージをグループ化
  const grouped = errorsData.reduce((acc, err) => {
    const key = err.error;
    if (!acc[key]) {
      acc[key] = { error: err.error, inputs: [], count: 0 };
    }
    acc[key].inputs.push(err.input);
    acc[key].count += 1;
    return acc;
  }, {});

  // グループごとに表示
  Object.values(grouped).forEach(group => {
    const errorElement = createErrorItem({ message: formatErrorMessage(group) });
    UI.errors.appendChild(errorElement);
  });
}

/**
 * グローバルエラーを表示
 * @param {Error} error - エラーオブジェクト
 */
function showGlobalError(error) {
  UI.errors.textContent = '';
  UI.errors.appendChild(createErrorItem({ message: error.message }));
}

// ===== エクスポート機能 =====

/**
 * ファイルをダウンロード
 * @param {string} content - ファイル内容
 * @param {string} fileName - ファイル名
 * @param {string} mimeType - MIMEタイプ
 */
function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * CSV形式でエクスポート
 */
function exportAsCSV() {
  if (!lastFetchedData || lastFetchedData.length === 0) {
    alert('エクスポートするデータがありません。');
    return;
  }

  // CSVヘッダー
  const headers = ['Channel', 'Title', 'URL', 'Published Date'];

  // CSVデータ行を生成
  const rows = lastFetchedData.flatMap(({ channelTitle, videos }) =>
    videos.map(video => [
      channelTitle,
      video.title,
      video.url,
      video.published
    ])
  );

  // CSV文字列を生成（XSS対策: ダブルクォートをエスケープ）
  const csvContent = [
    headers,
    ...rows
  ].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  // ダウンロード実行
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadFile(csvContent, `youtube-videos-${timestamp}.csv`, 'text/csv;charset=utf-8;');
}

/**
 * JSON形式でエクスポート
 */
function exportAsJSON() {
  if (!lastFetchedData || lastFetchedData.length === 0) {
    alert('エクスポートするデータがありません。');
    return;
  }

  // JSON データ構造
  const jsonData = {
    exportedAt: new Date().toISOString(),
    totalChannels: lastFetchedData.length,
    totalVideos: lastFetchedData.reduce((sum, { videos }) => sum + videos.length, 0),
    channels: lastFetchedData.map(({ channelTitle, videos }) => ({
      channelTitle,
      videoCount: videos.length,
      videos: videos.map(video => ({
        title: video.title,
        url: video.url,
        publishedDate: video.published
      }))
    }))
  };

  // ダウンロード実行
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadFile(
    JSON.stringify(jsonData, null, 2),
    `youtube-videos-${timestamp}.json`,
    'application/json;charset=utf-8;'
  );
}

// ===== メインロジック =====

/**
 * Promise pool: 同時実行数を制限しながらタスクを実行（順序保証）
 * @param {Array} items - 処理対象の配列
 * @param {number} limit - 同時実行数
 * @param {Function} task - 各アイテムに対する処理
 * @returns {Promise<Array>} - 結果の配列（入力順を保持）
 */
async function runWithLimit(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

/**
 * 入力をパースしてチャンネルIDを抽出
 * @param {string} rawInput - 生の入力文字列
 * @returns {{ valid: Array, invalid: Array }}
 */
async function parseChannelInput(rawInput) {
  const lines = rawInput
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    throw new Error(ERROR_MESSAGES.INPUT_REQUIRED);
  }

  // normalizeInput が非同期なので Promise.all を使用
  const normalizedPromises = lines.map(async line => ({
    original: line,
    ...await normalizeInput(line)
  }));

  const normalized = await Promise.all(normalizedPromises);

  return {
    valid: normalized.filter(n => n.success),
    invalid: normalized.filter(n => !n.success)
  };
}

/**
 * 複数チャンネルから動画情報を取得（Promise pool使用）
 * 段階的ロードの初期化と nextPageToken の保存を行う
 * @param {Array} validInputs - 有効な入力の配列
 * @param {number} limit - 取得件数
 * @param {{ startDate: Date|null, endDate: Date|null }} dateRange - 日付範囲
 * @returns {Promise<{ results: Array, errors: Array }>}
 */
async function runChannelFetches(validInputs, limit, dateRange) {
  // 段階的ロードの初期化
  loadingState.isLoading = true;
  loadingState.isCancelled = false;
  loadingState.abortController = null;
  loadingState.currentChannels = validInputs.map(v => v.channelId);
  loadingState.allVideos = [];
  loadingState.nextPageTokens = {};
  loadingState.hasMore = false;

  let completedCount = 0;
  const totalCount = validInputs.length;

  if (limit > 15) {
    showProgressWithCancel(0, totalCount, '');
  }

  const fetchResults = await runWithLimit(validInputs, CONCURRENCY_LIMIT, async (input) => {
    if (loadingState.isCancelled) {
      return { success: false, error: '操作はキャンセルされました。', input: input.original };
    }
    try {
      const data = await fetchChannelVideos(input.channelId, limit, dateRange);

      // nextPageToken を保存
      if (data.nextPageToken) {
        loadingState.nextPageTokens[input.channelId] = data.nextPageToken;
        loadingState.hasMore = true;
      } else {
        loadingState.nextPageTokens[input.channelId] = null;
      }

      // allVideos に保存（channelId含む）
      loadingState.allVideos.push({
        channelId: input.channelId,
        channelTitle: data.channelTitle,
        videos: data.videos.slice()
      });

      completedCount++;
      if (limit > 15) {
        showProgressWithCancel(completedCount, totalCount, data.channelTitle);
      } else {
        setLoadingState(true, `取得中... (${completedCount}/${totalCount} チャンネル処理済み)`);
      }

      return { success: true, data: { channelId: input.channelId, channelTitle: data.channelTitle, videos: data.videos } };
    } catch (error) {
      completedCount++;
      if (limit > 15) {
        showProgressWithCancel(completedCount, totalCount, '');
      } else {
        setLoadingState(true, `取得中... (${completedCount}/${totalCount} チャンネル処理済み)`);
      }
      return { success: false, error: error.message, input: input.original };
    }
  });

  // 成功/失敗を1回のreduceで仕分け
  return fetchResults.reduce((acc, result) => {
    if (result.success) {
      acc.results.push(result.data);
    } else {
      acc.errors.push({ input: result.input, error: result.error });
    }
    return acc;
  }, { results: [], errors: [] });
}

/**
 * 取得ボタンのハンドラー
 */
async function handleFetch() {
  const channelInput = UI.channelInput.value;
  const limit = parseLimit(UI.limitSelect.value);

  // 日付範囲の取得・検証
  const dateRange = getDateRange();

  if (dateRange.error) {
    clearOutputs();
    showGlobalError(new Error(dateRange.error));
    return;
  }

  // 状態リセットとローディング表示
  clearOutputs();
  setLoadingState(true, '取得中...');

  try {
    // 入力をパース（@username の解決を含む）
    const { valid, invalid } = await parseChannelInput(channelInput);

    // チャンネル情報を取得（Promise pool使用、日付範囲を渡す）
    const { results, errors } = await runChannelFetches(valid, limit, dateRange);

    // 不正な入力をエラーに追加
    const allErrors = [
      ...errors,
      ...invalid.map(input => ({ input: input.original, error: input.error }))
    ];

    // 結果表示
    if (results.length > 0) {
      renderResults(results);
      // エクスポート用にデータを保存（段階的ロードでは内部状態から集約）
      if (limit > 15) {
        lastFetchedData = loadingState.allVideos.map(({ channelTitle, videos }) => ({ channelTitle, videos }));
      } else {
        lastFetchedData = results.map(({ channelTitle, videos }) => ({ channelTitle, videos }));
      }
      // エクスポートボタンを表示
      if (UI.exportButtons) {
        UI.exportButtons.style.display = 'block';
      }
    }

    // エラー表示
    if (allErrors.length > 0) {
      renderErrors(allErrors);
    }

    // 全て失敗の場合（実際にフェッチした場合のみ）
    if (valid.length > 0 && results.length === 0 && allErrors.length > 0) {
      const allFailedMsg = createErrorItem({ message: ERROR_MESSAGES.ALL_FAILED });
      UI.errors.insertBefore(allFailedMsg, UI.errors.firstChild);
    }

  } catch (error) {
    // 全体エラー
    showGlobalError(error);

  } finally {
    // ボタン有効化、ローディング非表示
    setLoadingState(false);
    hideProgress();
    updateLoadMoreButton();
  }
}

// ===== イベントリスナー =====

UI.fetchButton.addEventListener('click', handleFetch);

// ダークモードトグルボタン
document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

// キーボードアクセシビリティ（Enterキーでも切り替え）
document.getElementById('themeToggle')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    toggleTheme();
  }
});

// 日付入力の制約設定とイベントリスナー
document.addEventListener('DOMContentLoaded', () => {
  // 今日の日付を取得（YYYY-MM-DD形式）
  const today = new Date().toISOString().split('T')[0];

  // 両方の入力に max=today を設定
  if (UI.startDate) UI.startDate.max = today;
  if (UI.endDate) UI.endDate.max = today;

  // 開始日が変更されたら、終了日の min を更新
  UI.startDate?.addEventListener('change', () => {
    if (UI.endDate && UI.startDate.value) {
      UI.endDate.min = UI.startDate.value;
    }
  });

  // 終了日が変更されたら、開始日の max を更新
  UI.endDate?.addEventListener('change', () => {
    if (UI.startDate && UI.endDate.value) {
      UI.startDate.max = UI.endDate.value;
    }
  });

  // クリアボタン
  UI.clearDates?.addEventListener('click', () => {
    if (UI.startDate) {
      UI.startDate.value = '';
      UI.startDate.max = today; // リセット
    }
    if (UI.endDate) {
      UI.endDate.value = '';
      UI.endDate.min = ''; // リセット
    }
  });
});

// キャンセルボタン
document.getElementById('cancelButton')?.addEventListener('click', handleCancel);

// さらに読み込むボタン
document.getElementById('loadMoreButton')?.addEventListener('click', loadMoreVideos);
