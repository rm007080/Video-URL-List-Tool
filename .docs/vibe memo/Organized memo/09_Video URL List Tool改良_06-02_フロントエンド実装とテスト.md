# Video URL List Tool 改良_06-02：フロントエンド実装とローカルテスト（フェーズ6続き）

## 📋 プロジェクト概要

**プロジェクト名**: Video URL List Tool  
**実装フェーズ**: フェーズ6 - フロントエンド実装とローカルテスト  
**実装日**: 2025年11月11日  
**実装状況**: Workers実装完了、フロントエンド実装完了、ローカルテスト実施中  
**技術スタック**: Pure HTML/CSS/JavaScript + Cloudflare Workers

---

## 🎯 このセッションの目的

**前回までの状況**:
- Workers側の実装完了（Durable Objects、API呼び出し、レート制限）
- Workersローカルテストは成功

**このセッションの目標**:
1. `app.js` の更新（920行 → 1240行）
2. `index.html` の更新（UI拡張）
3. ローカルテストの実施
4. 新機能の動作確認

**追加される主な機能**:
- 段階的ロード（50件、100件、500件、全件）
- プログレスバー表示
- キャンセル機能
- さらに読み込む機能

---

## 📅 実装フロー（時系列）

### 1. app.js の更新（920行 → 1240行）

**更新内容の概要**:

#### 1.1 グローバル状態管理 (`loadingState`)
```javascript
const loadingState = {
  cancelled: false,
  nextPageTokens: {},  // チャンネルIDごとのnextPageToken
};
```
- 段階的ロード用の状態を一元管理
- キャンセルフラグ
- ページネーショントークンの保存

#### 1.2 API取得機能 (`fetchChannelVideosAPI`)
```javascript
async function fetchChannelVideosAPI(channelId, limit, dateFrom, dateUntil, nextPageToken) {
  // Workers の /fetch-videos エンドポイント呼び出し
  // エラーコード別処理（quota_exceeded, rate_limit等）
  // キャンセル対応
}
```

#### 1.3 プログレス表示機能
```javascript
function showProgressWithCancel(channelId, channelTitle, current, total) {
  // プログレスバー表示
  // キャンセルボタン表示
}

function hideProgress() {
  // プログレス非表示
}
```

#### 1.4 さらに読み込む機能
```javascript
async function loadMoreVideos() {
  // nextPageToken を使った追加読み込み
  // 残りチャンネル数表示
}

function updateLoadMoreButton() {
  // ボタンテキストの更新
  // 「さらに読み込む（残り N チャンネル）」
}
```

#### 1.5 RSS/API自動切り替え (`fetchChannelVideos`)
```javascript
async function fetchChannelVideos(channelId, limit, dateFrom, dateUntil) {
  if (limit <= 15) {
    // RSS使用（高速）
    return await fetchChannelVideosRSS(channelId, dateFrom, dateUntil);
  } else {
    // API使用（段階的ロード）
    return await fetchChannelVideosAPI(channelId, limit, dateFrom, dateUntil);
  }
}
```

**変更統計**:
- 元のファイル: 920行
- 新しいファイル: 1240行（約35%拡張）
- バックアップ: `app.js.backup` に保存

**更新方法**:
Bashコマンドで直接上書き（ファイルが大きいため）

---

### 2. index.html の更新

#### 2.1 説明文の変更
```html
<!-- 変更前 -->
<p class="description">
  YouTube チャンネルに対応した動画URL・タイトル・公開日の取得ツール（最新15件まで）
</p>

<!-- 変更後 -->
<p class="description">
  YouTube チャンネルに対応した動画URL・タイトル・公開日の取得ツール
</p>
```
（最新15件まで）を削除 → 大量取得が可能になったため

#### 2.2 取得件数の選択肢を追加
```html
<select id="limitSelect">
  <option value="5">最新5件（RSS - 高速）</option>
  <option value="10">最新10件（RSS - 高速）</option>
  <option value="15" selected>最新15件（RSS - 高速）</option>
  <!-- 🆕 以下が追加 -->
  <option value="50">最新50件（API使用 - 段階的ロード）</option>
  <option value="100">最新100件（API使用 - 段階的ロード）</option>
  <option value="500">最新500件（API使用 - 段階的ロード）</option>
  <option value="-1">全件（API使用 - 段階的ロード、時間がかかります）</option>
</select>
```

**UX設計のポイント**:
- RSS（高速）と明記 → ユーザーに速度の違いを伝える
- API使用（段階的ロード）と明記 → プログレスバーが出ることを予告
- 全件には「時間がかかります」と注意喚起

#### 2.3 プログレス表示コンテナを追加
```html
<!-- プログレス表示コンテナ（段階的ロード用） -->
<div id="progressContainer" class="progress-container" hidden>
  <div class="progress-header">
    <span id="progressText">動画を取得中...</span>
    <button id="cancelButton" class="cancel-button">キャンセル</button>
  </div>
  <div class="progress-bar-container">
    <div id="progressBar" class="progress-bar"></div>
  </div>
</div>
```

**UI構造**:
```
┌─────────────────────────────────────────┐
│ 動画を取得中... 1/1 - チャンネル名    [キャンセル] │
│ ████████████████░░░░░░░░░░░░░░░░░░░░  60%  │
└─────────────────────────────────────────┘
```

#### 2.4 さらに読み込むボタンを追加
```html
<!-- さらに読み込むボタン -->
<button id="loadMoreButton" class="load-more-button" style="display: none;">
  さらに読み込む
</button>
```

**表示条件**:
- nextPageTokenが存在する場合のみ表示
- ボタンテキストは動的に変更（例: さらに読み込む（残り 2 チャンネル））

---

### 3. ローカルテストの準備

#### 3.1 サーバー起動
```bash
# フロントエンド（ユーザーが起動済み）
npx http-server -p 8000 -c-1
# → http://127.0.0.1:8000/

# Workers（Cursorが起動）
wrangler dev --local --port 8787
# → http://localhost:8787
```

#### 3.2 テスト計画
1. **テスト① - RSSモード（15件以下）**
   - 既存機能が壊れていないことを確認
2. **テスト② - APIモード（50件）**
   - 新機能（プログレスバー、キャンセル、さらに読み込む）の動作確認
3. **テスト③ - キャンセル機能**
   - キャンセルボタンの動作確認

---

## 📊 つまづきポイント（詳細）

### 🐛 つまづきポイント1: 本番Workers URLとローカルWorkers URLの混同

#### 問題の発生
**状況**:
```
テスト②（50件・APIモード）実施時
→ 400 (Bad Request) エラー
```

**エラーメッセージ**:
```
app.js:447 
GET https://youtube-list-tool-proxy.littlelit-3.workers.dev/fetch-videos?channelId=UCVAkt5l6kD4igMdVoEGTGIg&limit=50 400 (Bad Request)
```

**画面表示**:
```
@ai.seitai - APIエラー: 400
```

#### 原因の特定

**AIの推理プロセス**:
1. Workers側のログを確認 → 詳細なエラーログなし
2. `curl` でローカルWorkers (http://localhost:8787) をテスト → 正常動作
3. ブラウザは本番Workers URL (https://youtube-list-tool-proxy.littlelit-3.workers.dev) にアクセスしていることが判明

**根本原因**:
```javascript
// app.js の PROXY_CONFIG
const PROXY_CONFIG = [
  {
    name: 'Custom Worker',
    url: 'https://youtube-list-tool-proxy.littlelit-3.workers.dev/?url=',  // ← 本番URL
    timeout: 10000,
    enabled: true
  },
  // ...
];
```

**問題点**:
- ローカルテストでは `http://localhost:8787` を使うべき
- 本番URLは本番環境にデプロイされたWorkersを指している
- ローカルのWorkers (wrangler dev) とは別物

#### 解決策

**修正内容**:
```javascript
// app.js の PROXY_CONFIG を一時的に変更
const PROXY_CONFIG = [
  {
    name: 'Custom Worker',
    url: 'http://localhost:8787/?url=',  // ← ローカルURL
    timeout: 10000,
    enabled: true // ローカルテスト用に localhost を使用
  },
  // ...
];
```

**結果**:
✅ リロード後、50件の取得が成功

#### 非エンジニア向け説明

**例え話**:
```
本番Workers URL = 実際の店舗（東京・渋谷）
ローカルWorkers = 自宅のテスト店舗

今回やりたいこと:
- 自宅のテスト店舗で新しいメニュー（50件取得機能）をテスト

問題:
- アプリが「渋谷の店舗に注文してください」と指示していた
- でも、テストしたいのは「自宅のテスト店舗」

解決策:
- アプリの設定を「自宅のテスト店舗に注文してください」に変更
```

**重要な学び**:
1. **開発環境と本番環境の分離**
   - ローカルテスト: `http://localhost:8787`（自分のPC内）
   - 本番環境: `https://youtube-list-tool-proxy.littlelit-3.workers.dev`（Cloudflareのサーバー）
2. **環境の切り替えが必要**
   - ローカルテスト時: ローカルURL
   - 本番デプロイ時: 本番URL
3. **今後の改善案**
   - 環境変数で自動切り替え
   - 設定ファイルで管理

---

### 🐛 つまづきポイント2: @username解決のエラー（副次的）

#### 問題の発生
**状況**:
```
チャンネルID欄に「@ai.seitai」を入力
→ エラー: @ai.seitai - @ai.seitai のチャンネルが見つかりませんでした。
```

**エラーメッセージ（Console）**:
```
app.js:255 
GET http://localhost:8787/resolve-channel?username=ai.seitai 400 (Bad Request)
```

#### 原因

**推測される原因**:
- `/resolve-channel` エンドポイントがローカルWorkersで正しく動作していない可能性
- または、`@ai.seitai` というチャンネルが存在しない可能性

#### 解決策（回避）

**対応方針**:
- `@username` のテストは後回し
- まずはチャンネルID直接入力でテスト

**テストに使用したチャンネルID**:
```
UCVAkt5l6kD4igMdVoEGTGIg
```
（curlで動作確認済みのチャンネル）

**結果**:
✅ チャンネルIDでは正常に動作

---

### 🐛 つまづきポイント3: チャンネル名が「不明」になる問題

#### 問題の発生

**状況**:
```
チャンネルID: UCVAkt5l6kD4igMdVoEGTGIg で50件取得
→ 取得は成功
→ ただし「チャンネル名不明」と表示
→ 「さらに読み込む（残り1チャンネル）」ボタンも表示される
```

**スクリーンショット確認**:
```
✅ 50件の動画データが取得できている
✅ 「さらに読み込む（残り1チャンネル）」ボタンが表示
✅ エクスポートボタンも表示
❌ チャンネル名が「不明」
```

#### 原因の特定

**AIの調査プロセス**:
1. Workers側のコードを確認
2. `channelTitle` をgrep検索 → 見つからない
3. `/fetch-videos` エンドポイントのレスポンス構造を確認
4. レスポンスに `channelTitle` フィールドが含まれていないことを発見

**Workers側のレスポンス（修正前）**:
```javascript
// workers/youtube-proxy.js (402-410行)
const payload = {
  ok: true,
  channelId,
  count: videos.length,
  totalFetched: scannedTotal,
  partial,
  // ← channelTitle がない！
  videos,
  nextPageToken: partial ? null : nextPageToken,
};
```

**技術的な背景**:
- YouTube Data API の `playlistItems.list` はチャンネル名を返さない
- チャンネル名を取得するには別途 `channels.list` を呼び出す必要がある

#### 解決策

**修正内容**:
Workers側にチャンネル名取得処理を追加

```javascript
// workers/youtube-proxy.js (401-423行に追加)
// チャンネル名を取得（channels.list API呼び出し）
let channelTitle = '';
try {
  const channelParams = new URLSearchParams();
  channelParams.set('part', 'snippet');
  channelParams.set('id', channelId);
  channelParams.set('fields', 'items(snippet/title)');
  channelParams.set('key', apiKey);

  const channelRes = await youtubeApiFetchJson('/channels', channelParams, {
    timeoutMs: 10000,
    maxRetries: 2,
    request,
    env,
  });

  if (channelRes.data && channelRes.data.items && channelRes.data.items[0]) {
    channelTitle = channelRes.data.items[0].snippet?.title || '';
  }
} catch (e) {
  // チャンネル名取得失敗時は空文字列のまま続行
  console.warn('Failed to fetch channel title:', e);
}

// レスポンス構築
const payload = {
  ok: true,
  channelId,
  channelTitle,  // ← 追加！
  count: videos.length,
  totalFetched: scannedTotal,
  partial,
  videos,
  nextPageToken: partial ? null : nextPageToken,
};
```

**API呼び出しの詳細**:
```
エンドポイント: GET https://www.googleapis.com/youtube/v3/channels
パラメータ:
  - part=snippet
  - id=UCVAkt5l6kD4igMdVoEGTGIg
  - fields=items(snippet/title)  ← 必要な項目のみ取得（効率化）
  - key=AIzaSy...（APIキー）
```

**Workersの再起動**:
```bash
# 古いWorkersプロセスを終了
pkill -f "wrangler dev"

# 新しいWorkersを起動
wrangler dev --local --port 8787
```

**結果**:
✅ Workersが再起動
✅ チャンネル名取得処理が有効化

**再テスト手順**:
1. ブラウザを強制リロード（Ctrl+Shift+R）
2. チャンネルID: `UCVAkt5l6kD4igMdVoEGTGIg` を入力
3. 取得件数: 最新50件
4. 「取得」ボタンをクリック

**期待される結果**:
- ✅ チャンネル名が正しく表示される
- ✅ 50件の動画データ
- ✅ 「さらに読み込む」ボタン

#### 非エンジニア向け説明

**例え話**:
```
問題:
- 動画のリストは取得できた（50件）
- でも、「このチャンネルの名前は？」が分からない

原因:
- YouTube APIの動画取得機能（playlistItems.list）は動画情報しか返さない
- チャンネル名は含まれていない

解決策:
- 別のAPIを呼び出す（channels.list）
- 「チャンネルID → チャンネル名」を取得
- それを最初のレスポンスに追加

実装:
┌──────────────────┐
│ 1. 動画取得API   │ → 動画50件のデータを取得
│ (playlistItems)  │
└──────────────────┘
        ↓
┌──────────────────┐
│ 2. チャンネル情報 │ → チャンネル名を取得
│ (channels)       │
└──────────────────┘
        ↓
┌──────────────────┐
│ 3. 統合レスポンス │ → 動画データ + チャンネル名を返す
└──────────────────┘
```

**重要な学び**:
1. **API設計の理解**
   - 1つのAPIがすべての情報を返すとは限らない
   - 必要に応じて複数のAPIを組み合わせる
2. **エラーハンドリング**
   - チャンネル名取得失敗時も動画データは返す（部分的成功）
   - `try-catch` で安全に処理
3. **効率化**
   - `fields` パラメータで必要な項目のみ取得
   - APIクォータの節約

---

## 🎯 テスト結果の整理

### テスト① - RSSモード（15件以下）
**テスト内容**:
- 取得件数: 最新15件（RSS - 高速）
- チャンネルID: 任意

**結果**:
✅ 問題なく完了

**確認項目**:
- ✅ ローディングスピナーが表示される
- ✅ プログレスバーは表示されない（RSSモード）
- ✅ URLs/Titles/Published Dates が表示される
- ✅ エクスポートボタンが表示される
- ✅ 「さらに読み込む」ボタンは表示されない

**評価**:
既存機能（RSS）が壊れていないことを確認 ✅

---

### テスト② - APIモード（50件）
**テスト内容**:
- 取得件数: 最新50件（API使用 - 段階的ロード）
- チャンネルID: UCVAkt5l6kD4igMdVoEGTGIg

**初回テスト結果（修正前）**:
❌ 400 (Bad Request)
- 原因: 本番Workers URLを使用していた
- 解決: ローカルWorkers URL に変更

**2回目テスト結果（修正後）**:
⚠️ 取得は成功、ただしチャンネル名が「不明」
- 原因: Workers側でchannelTitleを返していなかった
- 解決: channels.list APIを追加呼び出し

**最終テスト結果（実施予定）**:
セッション終了時点で再テスト待ち

**期待される動作**:
- ✅ プログレスバーが表示される
- ✅ キャンセルボタンが表示される
- ✅ プログレステキストが進行状況を表示
- ✅ チャンネル名が正しく表示される
- ✅ URLs/Titles/Published Dates が表示される
- ✅ 「さらに読み込む」ボタンが表示される

---

### テスト③ - キャンセル機能
**テスト内容**:
- 取得件数: 最新100件 または 最新500件
- キャンセルボタンをクリック

**実施状況**:
まだ未実施

**期待される動作**:
- ✅ プログレステキストが「キャンセル中...」に変わる
- ✅ 取得が中断される
- ✅ 部分的な結果が表示される（またはエラーメッセージ）

---

## 📚 技術的な学び

### 1. ローカル開発環境の理解

**概念整理**:
```
┌─────────────────────────────────────────┐
│ ローカル開発環境（あなたのPC内）          │
│                                         │
│  ┌──────────────────┐  ┌─────────────┐ │
│  │ フロントエンド    │  │ Workers     │ │
│  │ http://127.0.0.1:8000 │  │ localhost:8787 │ │
│  │ (index.html,    │  │ (youtube-   │ │
│  │  app.js)        │  │  proxy.js)  │ │
│  └──────────────────┘  └─────────────┘ │
│         ↑                     ↑         │
│         └─────────┬───────────┘         │
│                   │                     │
│            お互いに通信可能              │
└─────────────────────────────────────────┘
```

**本番環境**:
```
┌─────────────────────────────────────────┐
│ Cloudflare（インターネット上）            │
│                                         │
│  ┌──────────────────┐  ┌─────────────┐ │
│  │ フロントエンド    │  │ Workers     │ │
│  │ youtubelisttool. │  │ youtube-list-│ │
│  │ pages.dev        │  │ tool-proxy. │ │
│  │                  │  │ workers.dev │ │
│  └──────────────────┘  └─────────────┘ │
│         ↑                     ↑         │
│         └─────────┬───────────┘         │
│                   │                     │
│            お互いに通信可能              │
└─────────────────────────────────────────┘
```

**重要なポイント**:
- ローカルと本番は別物
- ローカルテスト時はローカルURLを使う
- 本番デプロイ時は本番URLを使う

### 2. YouTube Data API の設計理解

**API構造**:
```
playlistItems.list
├─ 動画ID
├─ タイトル
├─ 公開日
└─ （チャンネル名は含まれない）

channels.list
├─ チャンネルID
├─ チャンネル名  ← これが必要！
├─ 説明文
└─ 登録者数など
```

**最適な使い方**:
1. `playlistItems.list` で動画リストを取得
2. `channels.list` でチャンネル名を取得
3. 両方を組み合わせてレスポンス構築

### 3. プログレス表示のUX

**設計思想**:
```
RSSモード（15件以下）:
- 高速（1-2秒）
- プログレスバー不要
- シンプルなローディングスピナーで十分

APIモード（16件以上）:
- 時間がかかる（5-30秒）
- プログレスバー必須
- キャンセル機能も必須
- 進行状況を細かく表示（1/3, 2/3, 3/3...）
```

**UX配慮**:
- ユーザーに「今どれくらい進んでいるか」を伝える
- ユーザーに「いつでもキャンセルできる」という安心感を与える

### 4. 段階的ロードの仕組み

**概念**:
```
最新100件を取得したい場合:

┌──────────┐  nextPageToken  ┌──────────┐  nextPageToken  ┌──────────┐
│ 1回目    │ ────────────→  │ 2回目    │ ────────────→  │ 3回目    │
│ 50件取得 │                 │ 50件取得 │                 │ 0件取得  │
└──────────┘                 └──────────┘                 └──────────┘
     ↓                            ↓                            ↓
  合計50件                     合計100件                    完了！
```

**実装のポイント**:
- `nextPageToken` の保存と再利用
- 「さらに読み込む」ボタンの表示/非表示
- 部分的なデータの蓄積

---

## 🔍 今後の課題

### 1. 環境の自動切り替え
**現状**:
- ローカルテスト時に手動でURLを変更
- 本番デプロイ時に手動でURLを戻す

**改善案**:
```javascript
// 環境判定
const isDevelopment = window.location.hostname === '127.0.0.1' || 
                      window.location.hostname === 'localhost';

const WORKERS_URL = isDevelopment 
  ? 'http://localhost:8787'
  : 'https://youtube-list-tool-proxy.littlelit-3.workers.dev';
```

### 2. @username 解決のデバッグ
**現状**:
- `/resolve-channel` エンドポイントで400エラー
- 原因未特定

**要調査項目**:
- Workers側のログ確認
- リクエストパラメータの検証
- レスポンスの詳細確認

### 3. キャンセル機能のテスト
**現状**:
- まだテストしていない

**テスト計画**:
- 100件、500件、全件でテスト
- 途中でキャンセルして部分的なデータが表示されるか確認

### 4. エラーハンドリングの強化
**追加すべき項目**:
- APIクォータ超過時のユーザーフレンドリーなメッセージ
- レート制限時のリトライ案内
- ネットワークエラー時の復帰方法

---

## 📝 変更ファイル一覧

### 修正したファイル
1. **app.js** (920行 → 1240行)
   - グローバル状態管理追加
   - API取得機能追加
   - プログレス表示機能追加
   - さらに読み込む機能追加
   - RSS/API自動切り替え実装
   - Workers URLをローカルに変更（一時的）

2. **index.html**
   - 説明文の変更（「最新15件まで」を削除）
   - 取得件数の選択肢を追加（50/100/500/全件）
   - プログレス表示コンテナを追加
   - さらに読み込むボタンを追加

3. **workers/youtube-proxy.js**
   - channelTitle取得処理を追加（channels.list API呼び出し）

### バックアップファイル
- `app.js.backup` (920行)
- `index.html.backup` (93行)

---

## 🎓 非エンジニア向けまとめ

### このセッションで何をしたか

**ステップ1: フロントエンドの大幅アップデート**
- app.js を320行追加（920行 → 1240行）
- 新機能を追加:
  - プログレスバー表示
  - キャンセルボタン
  - さらに読み込む機能
  - 段階的ロード

**ステップ2: UIの拡張**
- 取得件数の選択肢を増やした（5/10/15 → 50/100/500/全件）
- プログレスバーのデザインを追加
- さらに読み込むボタンを追加

**ステップ3: ローカルテスト**
- RSSモード（15件）は正常動作 ✅
- APIモード（50件）でつまづき:
  1. 本番URLとローカルURLの混同 → 解決
  2. チャンネル名が「不明」 → 解決（修正完了、再テスト待ち）

### つまづいたポイント（簡単に）

**問題1: URLの間違い**
- **例え**: 自宅のテスト店舗でテストしたいのに、渋谷の実店舗に注文していた
- **解決**: 設定を「自宅のテスト店舗」に変更

**問題2: チャンネル名が分からない**
- **例え**: 動画リストは取得できたけど、「このチャンネルの名前は？」が分からない
- **解決**: 別のAPIを呼び出してチャンネル名を取得

### 次にやること
1. ブラウザをリロード
2. 50件取得を再テスト
3. チャンネル名が正しく表示されるか確認
4. キャンセルボタンのテスト
5. さらに読み込むボタンのテスト

---

## 📊 セッション終了時の状態

### 完了した作業
- ✅ app.js の更新（920行 → 1240行）
- ✅ index.html の更新
- ✅ Workers側のchannelTitle取得処理追加
- ✅ Workersローカルサーバー再起動
- ✅ テスト①（RSSモード）完了

### 実施中の作業
- ⏳ テスト②（APIモード・50件）- 再テスト待ち
- ⏳ チャンネル名表示の確認待ち

### 未実施の作業
- ⏸️ テスト③（キャンセル機能）
- ⏸️ テスト④（さらに読み込む機能）
- ⏸️ テスト⑤（100件、500件、全件）
- ⏸️ @username 解決のデバッグ
- ⏸️ 本番環境へのデプロイ

---

## 🚀 次のステップ

1. **即座に実施**
   - ブラウザをリロード（Ctrl+Shift+R）
   - テスト②を再実行
   - チャンネル名が正しく表示されるか確認

2. **その後**
   - テスト③（キャンセル機能）
   - テスト④（さらに読み込む機能）
   - @username 解決のデバッグ

3. **最終段階**
   - app.js のWorkers URLを本番に戻す
   - コミット & プッシュ
   - PR作成
   - Preview環境でテスト
   - mainにマージ

---

## 📌 重要な気づき

### 開発プロセスの理解
1. **ローカルテストの重要性**
   - 本番にデプロイする前に必ずローカルで確認
   - 問題があれば即座に修正できる

2. **段階的なテスト**
   - まず既存機能（RSS）が壊れていないことを確認
   - 次に新機能（API）をテスト
   - 問題があれば1つずつ解決

3. **デバッグの流れ**
   - エラーメッセージを確認
   - ログを確認
   - 原因を特定
   - 修正
   - 再テスト

### API設計の理解
1. **複数APIの組み合わせ**
   - 1つのAPIがすべてを返すとは限らない
   - 必要に応じて複数APIを呼び出す

2. **効率化の工夫**
   - `fields` パラメータで必要な項目のみ取得
   - APIクォータを節約

3. **エラーハンドリング**
   - 部分的な失敗を許容する設計
   - ユーザーに有用な情報を返す

---

*このドキュメントは、フェーズ6のフロントエンド実装とローカルテストの記録です。つまづきポイントを詳細に記録し、今後同じ問題が起きた際の参考資料としています。*




