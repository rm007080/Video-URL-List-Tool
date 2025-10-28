# Video URL List Tool - 最終実装計画 v3

**作成日**: 2025-10-25
**ステータス**: Codex レビュー完了、実装準備完了
**レビュー回数**: 3回

---

## 📋 目次

1. [プロジェクト概要](#プロジェクト概要)
2. [修正履歴サマリー](#修正履歴サマリー)
3. [ファイル構成](#ファイル構成)
4. [実装コード（完全版）](#実装コード完全版)
5. [セキュリティ対策](#セキュリティ対策)
6. [既知の制限事項](#既知の制限事項)
7. [受入れテスト項目](#受入れテスト項目)
8. [実装手順](#実装手順)

---

## プロジェクト概要

### 目的
YouTube チャンネルに対応した動画情報取得ツール。指定したチャンネルから動画の URL・タイトル・公開日を取得し、NotebookLM 等に貼り付け可能な形式で出力する。

### MVP 要件
- **入力形式**: チャンネルID（`UC...`）またはチャンネルURL（`/channel/UC...`）
- **取得件数**: 最新5〜15件（YouTube RSS の仕様により最大15件）
- **取得方法**: YouTube RSS フィード（`https://www.youtube.com/feeds/videos.xml?channel_id=...`）
- **出力形式**: チャンネル別セクションで、URLs / Titles / Published Dates をコードブロック表示
- **実行方法**: ローカルサーバー（`python -m http.server 8000`）で実行

### 非対応形式
- ❌ `@username`（YouTube Data API が必要）
- ❌ `/c/channelname`（廃止された形式）

---

## 修正履歴サマリー

### Codex レビュー 1回目
| 優先度 | 問題 | 修正内容 |
|-------|------|---------|
| P0 | Content-Type 検証で全失敗 | XML パースエラーで判定に変更 |
| P1 | URL エンコード漏れ | `encodeURIComponent` 使用 |
| P1 | フォールバック条件不足 | 全例外でリトライ、HTML エラーページ検出 |
| P1 | 状態リセット漏れ | `textContent = ''` で初期化 |
| P1 | 並列実行制限なし | 同時3件に制限 |
| P2 | 空行処理未定義 | `trim()` + `filter` |
| P2 | タイトル切り捨て未定義 | サロゲートペア対応 |

### Codex レビュー 2回目
| 優先度 | 問題 | 修正内容 |
|-------|------|---------|
| P2 | fetchWithTimeout の未処理 Promise | AbortController 使用 |
| P2 | parseInt の NaN チェック不足 | `Number.isFinite` でフォールバック |

### Codex レビュー 3回目
| 優先度 | 問題 | 修正内容 |
|-------|------|---------|
| P2 | parseInt 基数未指定 | `parseInt(value, 10)` に修正 |
| P2 | Abort エラーメッセージ不明瞭 | "タイムアウトしました" に変換 |

---

## ファイル構成

```
YouTubeListTool/
├── index.html              # メインUIページ（~60行）
├── style.css               # スタイリング（~150行）
├── app.js                  # コアロジック（~360行）
├── README.md               # 実行手順・制限事項（~200行）
├── LICENSE                 # ライセンス
├── CLAUDE.md               # 開発ルール
└── IMPLEMENTATION_PLAN.md  # このファイル
```

---

## 実装コード（完全版）

### 1. index.html

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Video URL List Tool</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <h1>Video URL List Tool</h1>

    <p class="description">
      YouTube チャンネルに対応した動画URL・タイトル・公開日の取得ツール（最新15件まで）
    </p>

    <div class="info-box">
      <strong>対応形式:</strong><br>
      ✅ UC1234567890abcdefghij（チャンネルID）<br>
      ✅ https://www.youtube.com/channel/UC...（チャンネルURL）<br>
      ❌ @username、/c/channelname（非対応）
    </div>

    <div class="form-group">
      <label for="channelInput">チャンネルID/URL（1行1件）:</label>
      <textarea id="channelInput" rows="5" placeholder="UC1234567890abcdefghij&#10;https://www.youtube.com/channel/UC..."></textarea>
    </div>

    <div class="form-group">
      <label for="limitSelect">取得件数:</label>
      <select id="limitSelect">
        <option value="5">最新5件</option>
        <option value="10">最新10件</option>
        <option value="15" selected>最新15件（最大）</option>
      </select>
    </div>

    <button id="fetchButton">取得</button>

    <div id="loading" class="loading" style="display: none;">
      <div class="spinner"></div>
      <p>取得中...</p>
    </div>

    <div id="errors" class="errors"></div>
    <div id="results" class="results"></div>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

---

### 2. style.css

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  background-color: #f5f5f5;
  padding: 20px;
  line-height: 1.6;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  background: white;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

h1 {
  color: #333;
  margin-bottom: 10px;
}

.description {
  color: #666;
  margin-bottom: 20px;
}

.info-box {
  background-color: #e3f2fd;
  border-left: 4px solid #2196f3;
  padding: 12px;
  margin-bottom: 20px;
  font-size: 14px;
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  font-weight: bold;
  margin-bottom: 8px;
  color: #333;
}

textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: monospace;
  font-size: 14px;
  resize: vertical;
}

select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

button {
  background-color: #4caf50;
  color: white;
  padding: 12px 24px;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.3s;
}

button:hover {
  background-color: #45a049;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.loading {
  margin-top: 20px;
  text-align: center;
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #4caf50;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 0 auto;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.errors {
  margin-top: 20px;
}

.error-item {
  background-color: #ffebee;
  border-left: 4px solid #f44336;
  padding: 12px;
  margin-bottom: 10px;
  border-radius: 4px;
}

.error-item strong {
  color: #c62828;
}

.results {
  margin-top: 20px;
}

.channel-section {
  margin-bottom: 30px;
  padding: 20px;
  background-color: #fafafa;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
}

.channel-header {
  font-size: 18px;
  font-weight: bold;
  color: #333;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 2px solid #4caf50;
}

.output-block {
  margin-bottom: 20px;
}

.output-block h3 {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.output-block pre {
  background-color: #263238;
  color: #aed581;
  padding: 15px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.output-block pre code {
  background: none;
  padding: 0;
}
```

---

### 3. app.js

```javascript
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
```

---

## セキュリティ対策

### 実装済み

| 対策項目 | 実装内容 | コード箇所 |
|---------|---------|-----------|
| XSS 対策 | `textContent` のみ使用、`innerHTML` 禁止 | `app.js:267, 279, 294` |
| 入力バリデーション | CHANNEL_ID_REGEX でチェック | `app.js:64-71` |
| Content-Type 検証 | XML パースエラーで判定 | `app.js:179-183` |
| タイムアウト設定 | 10秒でタイムアウト | `app.js:20-30` |
| エラーメッセージ | ユーザー入力を含まない固定文言 | `app.js:88-104` |
| CORS Proxy リスク | README に第三者サービス利用を明記 | `README.md` |

### 対策の詳細

#### 1. XSS（クロスサイトスクリプティング）対策
- **方針**: DOM 操作で `innerHTML` を一切使用せず、`textContent` のみ使用
- **効果**: HTML タグがエスケープされ、スクリプト実行を防止

#### 2. 入力バリデーション
- **方針**: 正規表現でチャンネルID 形式（`UC` + 22文字）をチェック
- **効果**: 不正な入力を事前に検出し、エラーメッセージで案内

#### 3. XML パースエラー検出
- **方針**: DOMParser の `parsererror` 要素をチェック
- **効果**: 不正な XML レスポンスを検出し、エラーハンドリング

#### 4. タイムアウト設定
- **方針**: AbortController で10秒後にリクエストを中断
- **効果**: ネットワーク遅延時の無限待機を防止

---

## 既知の制限事項

### YouTube RSS の仕様
1. **最新15件まで**: YouTube RSS フィードは最新15件までしか提供しません
2. **ページネーション不可**: 16件目以降の動画は取得できません
3. **更新遅延**: RSS の更新には数分〜数時間の遅延があります

### CORS Proxy の制限
1. **第三者サービス依存**: allorigins.win、corsproxy.io を使用
2. **レート制限**: 1時間あたりの利用回数に制限があります
3. **ログ記録**: チャンネルID が第三者サーバーのログに記録される可能性があります
4. **サービス停止リスク**: サービス提供者の都合で停止する可能性があります

### アプリケーションの制限
1. **並列取得制限**: 同時3チャンネルまで（レート制限回避のため）
2. **非対応形式**: `@username`、`/c/channelname` は非対応
3. **ブラウザ制限**: CORS 制限により、ローカルサーバーでの実行が必須

---

## 受入れテスト項目

### 基本動作
- [ ] チャンネルID（`UC...`）入力 → 結果表示
- [ ] チャンネルURL（`/channel/UC...`）入力 → 結果表示
- [ ] 取得件数5件選択 → 5件のみ表示
- [ ] 取得件数10件選択 → 10件のみ表示
- [ ] 取得件数15件選択 → 15件のみ表示

### 複数チャンネル
- [ ] 2件入力 → 2セクション表示
- [ ] 5件入力 → 5セクション表示（同時3件ずつ処理）
- [ ] 1件成功・1件失敗 → 結果とエラー両方表示

### エラーハンドリング
- [ ] `@username` 入力 → エラーメッセージ表示
- [ ] `/c/channelname` 入力 → エラーメッセージ表示
- [ ] 不正なID 入力 → エラーメッセージ表示
- [ ] 存在しないチャンネル → 404エラー表示
- [ ] 空行のみ入力 → エラーメッセージ表示
- [ ] 空白文字のみ → スキップされる

### UI/UX
- [ ] 取得中はボタン無効化
- [ ] ローディング表示が出る
- [ ] エラーは赤色で表示
- [ ] コードブロックはコピー可能
- [ ] 2回目実行時、前回の結果がクリアされる

### セキュリティ
- [ ] タイトルに HTML タグを含む動画 → エスケープされて表示
- [ ] タイトルに `<script>` タグを含む → スクリプト実行されない
- [ ] タイムアウト（10秒超過）→ エラーメッセージ表示

---

## 実装手順

### 前提条件
- ローカル環境に Python 3.x がインストールされていること
- モダンブラウザ（Chrome, Firefox, Edge, Safari 等）が利用可能なこと

### ステップ 1: ファイル作成

```bash
# プロジェクトディレクトリに移動
cd /mnt/c/Users/littl/app-dev/05_YouTubeListTool/YouTubeListTool

# 以下のファイルを作成（このドキュメントの「実装コード」セクションを参照）
# - index.html
# - style.css
# - app.js
```

### ステップ 2: README.md の更新

既存の `README.md` を以下の内容で更新してください：

```markdown
# Video URL List Tool

YouTube チャンネルに対応した動画情報取得ツール。指定したチャンネルから動画の URL・タイトル・公開日を取得し、NotebookLM 等に貼り付け可能な形式で出力します。

## 機能

- YouTube チャンネルの動画情報（URL/タイトル/公開日）を取得
- 最新5〜15件まで選択可能（YouTube RSS の仕様により最大15件）
- 複数チャンネルの一括取得に対応
- チャンネルごとに結果を分割表示

## 対応入力形式

### ✅ 対応

- `UC1234567890abcdefghij` - チャンネルID（UC + 22文字）
- `https://www.youtube.com/channel/UC...` - チャンネルURL

### ❌ 非対応

- `@username` - ハンドル形式（YouTube Data API が必要）
- `/c/channelname` - カスタムURL（廃止された形式）

## ローカル実行手順

### 1. リポジトリをクローン

```bash
git clone <repository-url>
cd YouTubeListTool
```

### 2. ローカルサーバーを起動

CORS 制限を回避するため、ローカルサーバーで実行してください。

#### Python 3.x の場合

```bash
python -m http.server 8000
```

#### Python 2.x の場合

```bash
python -m SimpleHTTPServer 8000
```

#### Node.js（http-server）の場合

```bash
npx http-server -p 8000
```

### 3. ブラウザでアクセス

```
http://localhost:8000/index.html
```

## 使い方

1. テキストエリアにチャンネルID または チャンネルURL を入力（1行1件）
2. 取得件数を選択（5件、10件、15件）
3. 「取得」ボタンをクリック
4. 結果が表示されたら、コードブロックをコピーして NotebookLM 等に貼り付け

## 制限事項

### YouTube RSS の仕様

- **最新15件まで**: YouTube RSS フィードは最新15件までしか提供しません
- **ページネーション不可**: 16件目以降の動画は取得できません

### CORS Proxy の制限

このツールは以下の第三者 CORS Proxy サービスを使用しています：

1. https://api.allorigins.win（プライマリ）
2. https://corsproxy.io（フォールバック）

**注意事項:**
- レート制限により一時的に利用できない場合があります
- 第三者サービスのため、ログにチャンネルIDが記録される可能性があります
- サービス停止時は取得できません

### 並列取得の制限

- 同時に3チャンネルまで取得します
- 大量のチャンネルを入力すると、処理に時間がかかります

## トラブルシューティング

### エラー: 全てのCORS Proxyが利用できません

**原因**: CORS Proxy サービスがダウンしているか、レート制限に達しています。

**対処法**:
- 時間をおいて再試行してください
- 入力するチャンネル数を減らしてください

### エラー: @username 形式は非対応です

**原因**: ハンドル（@username）形式はチャンネルID への変換に YouTube Data API が必要です。

**対処法**:
1. YouTube でチャンネルページを開く
2. ページのソースを表示（Ctrl+U または右クリック→ページのソースを表示）
3. `"channelId":"UC..."` を検索
4. 見つかったチャンネルID（UC...）を使用

### エラー: 取得失敗: Invalid XML format

**原因**: チャンネルが存在しないか、RSS フィードが無効です。

**対処法**:
- チャンネルID が正しいか確認してください
- ブラウザで `https://www.youtube.com/feeds/videos.xml?channel_id=UC...` に直接アクセスして確認

### タイムアウトエラー

**原因**: ネットワーク接続が遅いか、CORS Proxy が応答していません。

**対処法**:
- インターネット接続を確認してください
- 時間をおいて再試行してください

## セキュリティ

- XSS 対策: `textContent` のみ使用、`innerHTML` は使用していません
- 入力バリデーション: 正規表現でチャンネルID 形式をチェック
- Content-Type 検証: XML パースエラーで不正なレスポンスを検出
- タイムアウト設定: 各リクエストは10秒でタイムアウト

## ライセンス

MIT License

## 開発者向け情報

### ファイル構成

```
.
├── index.html              # メインUIページ
├── style.css               # スタイリング
├── app.js                  # コアロジック
├── README.md               # このファイル
├── LICENSE                 # ライセンス
├── CLAUDE.md               # 開発ルール
└── IMPLEMENTATION_PLAN.md  # 実装計画
```

### 技術スタック

- Pure HTML/CSS/JavaScript（フレームワーク不使用）
- DOMParser API（XML パース）
- Fetch API（HTTP リクエスト）
- AbortController（タイムアウト制御）
- CORS Proxy（第三者サービス）

### カスタマイズ

#### CORS Proxy を変更する場合

`app.js` の `PROXY_CONFIG` を編集：

```javascript
const PROXY_CONFIG = [
  { url: 'https://your-proxy.com/?url=', timeout: 10000 },
  // ...
];
```

#### 並列実行数を変更する場合

`app.js` の `CONCURRENCY_LIMIT` を編集：

```javascript
const CONCURRENCY_LIMIT = 5; // 同時5件に変更
```

#### 取得件数の選択肢を変更する場合

`index.html` の `limitSelect` を編集：

```html
<select id="limitSelect">
  <option value="3">最新3件</option>
  <option value="5">最新5件</option>
  <option value="10">最新10件</option>
  <option value="15" selected>最新15件（最大）</option>
</select>
```
```

### ステップ 3: ローカルサーバーで動作確認

```bash
# ローカルサーバー起動
python -m http.server 8000

# ブラウザで http://localhost:8000/index.html を開く
```

### ステップ 4: 受入れテスト実施

「受入れテスト項目」セクションの全項目をテストしてください。

### ステップ 5: Git コミット

```bash
# 変更内容を確認
git status
git diff

# ファイルを追加
git add index.html style.css app.js README.md IMPLEMENTATION_PLAN.md

# コミット（CLAUDE.md のルールに従い、自動コミットは禁止）
# ユーザーが手動でコミットを実行してください
```

---

## 補足事項

### Codex レビューの最終評価

**ステータス**: ✅ 問題なし、実装可能

**レビュー結果**:
- P0（重大）問題: なし
- P1（高）問題: なし
- P2（中）問題: なし

**推奨事項**:
1. タイムアウトや全チャネル失敗時にユーザーへ「次のリトライ推奨時間」などヒントを与える（将来改善）
2. `@handle` を公式 URL へ解決する手段（YouTube Data API v3 など）を検討（将来改善）
3. CORS プロキシの利用規約・レート制限を README に明文化（完了）

### 次のステップ

1. このドキュメントに従ってファイルを作成
2. ローカル環境で動作確認
3. 受入れテスト実施
4. 問題なければ Git コミット
5. 必要に応じて GitHub にプッシュ（CLAUDE.md のルールに従う）

---

**END OF IMPLEMENTATION PLAN**
