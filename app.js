// ===== 定数定義 =====

const PROXY_CONFIG = [
  { url: 'https://api.allorigins.win/raw?url=', timeout: 10000 },
  { url: 'https://corsproxy.io/?', timeout: 10000 }
];

const CHANNEL_ID_REGEX = /^UC[\w-]{22}$/;
const CHANNEL_URL_REGEX = /youtube\.com\/channel\/(UC[\w-]{22})/;
const CONCURRENCY_LIMIT = 3; // 同時実行数の制限
const DEFAULT_LIMIT = 15;

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
        throw new Error('タイムアウトしました');
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
    return 'チャンネル名不明';
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
 * 入力を正規化してチャンネルIDを抽出
 * @param {string} input - ユーザー入力
 * @returns {{ success: boolean, channelId?: string, error?: string }}
 */
function normalizeInput(input) {
  const trimmed = input.trim();

  // 空行チェック
  if (trimmed.length === 0) {
    return { success: false, error: '空行' };
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

  // 非対応形式
  if (trimmed.includes('@')) {
    return {
      success: false,
      error: '@username 形式は非対応です。チャンネルID（UC...）を使用してください。'
    };
  }

  if (trimmed.includes('/c/')) {
    return {
      success: false,
      error: '/c/ 形式は廃止されました。チャンネルID（UC...）を使用してください。'
    };
  }

  return {
    success: false,
    error: '不正な形式です。チャンネルID（UC...）または /channel/UC... を入力してください。'
  };
}

// ===== CORS Proxy フェッチ（フォールバック対応）=====

/**
 * CORS Proxy 経由でフェッチ（全エラーでフォールバック）
 * @param {string} targetUrl - 取得対象のURL
 * @param {number} proxyIndex - 現在のProxy インデックス
 * @returns {Promise<string>} - レスポンステキスト
 */
async function fetchWithProxy(targetUrl, proxyIndex = 0) {
  if (proxyIndex >= PROXY_CONFIG.length) {
    throw new Error('全てのCORS Proxyが利用できません。時間をおいて再試行してください。');
  }

  const proxy = PROXY_CONFIG[proxyIndex];
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

    return text;

  } catch (error) {
    console.warn(`Proxy ${proxyIndex + 1} failed:`, error.message);
    return fetchWithProxy(targetUrl, proxyIndex + 1);
  }
}

// ===== RSS 取得・パース =====

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
      throw new Error('Invalid XML format');
    }

    // チャンネルタイトル取得
    const channelTitle = doc.querySelector('feed > title')?.textContent || 'チャンネル名不明';

    // 動画エントリー取得
    const entries = Array.from(doc.querySelectorAll('entry'));
    const videos = entries.slice(0, limit).map(entry => {
      const videoId = entry.querySelector('videoId')?.textContent || '';
      const title = entry.querySelector('title')?.textContent || 'タイトル不明';
      const published = entry.querySelector('published')?.textContent || '';

      return {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: title,
        published: published
      };
    });

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
  const resultsContainer = document.getElementById('results');

  resultsData.forEach(({ channelTitle, videos }) => {
    // チャンネルセクション作成
    const section = document.createElement('div');
    section.className = 'channel-section';

    // ヘッダー
    const header = document.createElement('div');
    header.className = 'channel-header';
    header.textContent = truncateTitle(channelTitle);
    section.appendChild(header);

    // URLs ブロック
    const urlsBlock = createOutputBlock('URLs', videos.map(v => v.url).join('\n'));
    section.appendChild(urlsBlock);

    // Titles ブロック
    const titlesBlock = createOutputBlock('Titles', videos.map(v => v.title).join('\n'));
    section.appendChild(titlesBlock);

    // Published Dates ブロック
    const datesBlock = createOutputBlock('Published Dates', videos.map(v => v.published).join('\n'));
    section.appendChild(datesBlock);

    resultsContainer.appendChild(section);
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
 * エラーを表示
 */
function renderErrors(errorsData) {
  const errorsContainer = document.getElementById('errors');

  errorsData.forEach(({ input, error }) => {
    const errorItem = document.createElement('div');
    errorItem.className = 'error-item';

    const strong = document.createElement('strong');
    strong.textContent = 'エラー: ';
    errorItem.appendChild(strong);

    const message = document.createTextNode(`${input} - ${error}`);
    errorItem.appendChild(message);

    errorsContainer.appendChild(errorItem);
  });
}

// ===== メインロジック =====

/**
 * 取得ボタンのハンドラー
 */
async function handleFetch() {
  const fetchButton = document.getElementById('fetchButton');
  const loadingDiv = document.getElementById('loading');
  const resultsContainer = document.getElementById('results');
  const errorsContainer = document.getElementById('errors');
  const channelInput = document.getElementById('channelInput').value;

  // parseInt に基数を指定、NaN チェック
  const limitValue = parseInt(document.getElementById('limitSelect').value, 10);
  const limit = Number.isFinite(limitValue) ? limitValue : DEFAULT_LIMIT;

  // 状態リセット
  resultsContainer.textContent = '';
  errorsContainer.textContent = '';

  // ボタン無効化、ローディング表示
  fetchButton.disabled = true;
  loadingDiv.style.display = 'block';

  try {
    // 空行スキップ
    const lines = channelInput
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      throw new Error('チャンネルIDまたはURLを入力してください。');
    }

    // 入力正規化
    const normalized = lines.map(line => ({
      original: line,
      ...normalizeInput(line)
    }));

    // エラー入力を分離
    const validInputs = normalized.filter(n => n.success);
    const invalidInputs = normalized.filter(n => !n.success);

    // 並列実行を制限（同時3件まで）
    const results = [];
    const errors = [];

    for (let i = 0; i < validInputs.length; i += CONCURRENCY_LIMIT) {
      const batch = validInputs.slice(i, i + CONCURRENCY_LIMIT);
      const batchPromises = batch.map(input =>
        fetchChannelVideos(input.channelId, limit)
          .then(data => ({ success: true, data, input: input.original }))
          .catch(error => ({ success: false, error: error.message, input: input.original }))
      );

      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach(result => {
        if (result.success) {
          results.push(result.data);
        } else {
          errors.push({ input: result.input, error: result.error });
        }
      });
    }

    // 不正な入力をエラーに追加
    invalidInputs.forEach(input => {
      errors.push({ input: input.original, error: input.error });
    });

    // 結果表示
    if (results.length > 0) {
      renderResults(results);
    }

    // エラー表示
    if (errors.length > 0) {
      renderErrors(errors);
    }

    // 全て失敗の場合
    if (results.length === 0 && errors.length > 0) {
      const errorMsg = document.createElement('div');
      errorMsg.className = 'error-item';
      errorMsg.textContent = '全てのチャンネルで取得に失敗しました。入力内容を確認してください。';
      errorsContainer.insertBefore(errorMsg, errorsContainer.firstChild);
    }

  } catch (error) {
    // 全体エラー
    errorsContainer.textContent = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-item';
    errorDiv.textContent = `エラー: ${error.message}`;
    errorsContainer.appendChild(errorDiv);

  } finally {
    // ボタン有効化、ローディング非表示
    fetchButton.disabled = false;
    loadingDiv.style.display = 'none';
  }
}

// ===== イベントリスナー =====

document.getElementById('fetchButton').addEventListener('click', handleFetch);
