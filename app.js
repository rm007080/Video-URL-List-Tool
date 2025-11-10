// ===== 定数定義 =====

// CORS Proxy 設定
// 優先順位: 自前Worker > allorigins.win > corsproxy.io
const PROXY_CONFIG = [
  {
    name: 'Custom Worker',
    url: 'https://youtube-list-tool-proxy.littlelit-3.workers.dev/?url=',
    timeout: 10000,
    enabled: true // デプロイ後に true に変更
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
  TITLE_UNKNOWN: 'タイトル不明'
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
  get exportButtons() { return document.getElementById('exportButtons'); }
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
 * チャンネルの動画情報を取得
 * @param {string} channelId - チャンネルID
 * @param {number} limit - 取得件数
 * @returns {Promise<{ videos: Array, channelTitle: string }>}
 */
async function fetchChannelVideos(channelId, limit) {
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

    // 動画エントリー取得（共通パーサ使用）
    const entries = Array.from(doc.querySelectorAll('entry'));
    const videos = entries.slice(0, limit).map(entryToVideo);

    // URL検証（セキュリティ: 不正なURL検出）
    const urlsAreYoutube = videos.every(v => v.url.startsWith('https://www.youtube.com/watch?v='));
    if (!urlsAreYoutube) {
      throw new Error(ERROR_MESSAGES.INVALID_URL);
    }

    return { videos, channelTitle };

  } catch (error) {
    throw new Error(`取得失敗: ${error.message}`);
  }
}

// ===== UI 更新 =====

/**
 * 結果を表示
 */
function renderResults(resultsData) {
  resultsData.forEach(({ channelTitle, videos }) => {
    // チャンネルセクション作成
    const section = document.createElement('div');
    section.className = 'channel-section';

    // ヘッダー
    const header = document.createElement('div');
    header.className = 'channel-header';
    header.textContent = truncateTitle(channelTitle);
    section.appendChild(header);

    // 配列を1回だけ走査して3つの文字列を生成（パフォーマンス改善）
    const aggregated = videos.reduce((acc, video) => {
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

    UI.results.appendChild(section);
  });
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
 * @param {Array} validInputs - 有効な入力の配列
 * @param {number} limit - 取得件数
 * @returns {Promise<{ results: Array, errors: Array }>}
 */
async function runChannelFetches(validInputs, limit) {
  let completedCount = 0;
  const totalCount = validInputs.length;

  const fetchResults = await runWithLimit(validInputs, CONCURRENCY_LIMIT, async (input) => {
    try {
      const result = { success: true, data: await fetchChannelVideos(input.channelId, limit) };
      completedCount++;
      setLoadingState(true, `取得中... (${completedCount}/${totalCount} チャンネル処理済み)`);
      return result;
    } catch (error) {
      completedCount++;
      setLoadingState(true, `取得中... (${completedCount}/${totalCount} チャンネル処理済み)`);
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

  // 状態リセットとローディング表示
  clearOutputs();
  setLoadingState(true, '取得中...');

  try {
    // 入力をパース（@username の解決を含む）
    const { valid, invalid } = await parseChannelInput(channelInput);

    // チャンネル情報を取得（Promise pool使用）
    const { results, errors } = await runChannelFetches(valid, limit);

    // 不正な入力をエラーに追加
    const allErrors = [
      ...errors,
      ...invalid.map(input => ({ input: input.original, error: input.error }))
    ];

    // 結果表示
    if (results.length > 0) {
      renderResults(results);
      // エクスポート用にデータを保存
      lastFetchedData = results;
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
  }
}

// ===== イベントリスナー =====

UI.fetchButton.addEventListener('click', handleFetch);
