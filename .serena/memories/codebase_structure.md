# コードベースの構造

## ディレクトリ構造

```
YouTubeListTool/
├── index.html              # メインHTML（UIとフォーム）
├── app.js                  # JavaScriptロジック（16KB、512行）
├── style.css               # スタイルシート（3KB）
├── README.md               # ユーザー向けドキュメント
├── CLAUDE.md               # 開発ルール（必読）
├── HANDOVER.md             # 引き継ぎドキュメント
├── IMPLEMENTATION_PLAN.md  # 実装計画
├── LICENSE                 # MITライセンス
├── .gitignore              # Git除外設定
├── .git/                   # Gitリポジトリ
├── .claude/                # Claude Code設定（Git除外）
├── .cursor/                # Cursor設定
├── .serena/                # Serena MCP設定
├── .mcp.json               # MCP設定
└── screenshots/            # スクリーンショット保存用（Git除外）
```

## 主要ファイルの役割

### index.html
- メインUIページ
- フォーム要素（テキストエリア、選択ボックス、ボタン）
- 結果表示エリア
- ローディングインジケーター
- エラー表示エリア

### app.js（512行）
JavaScriptの主要な構成：

#### 定数定義
- `PROXY_CONFIG`: CORS Proxyの設定
- `CHANNEL_ID_REGEX`: チャンネルID検証用正規表現
- `CHANNEL_URL_REGEX`: チャンネルURL検証用正規表現
- `CONCURRENCY_LIMIT`: 並列実行数制限（3件）
- `DEFAULT_LIMIT`: デフォルト取得件数（15件）
- `ERROR_MESSAGES`: エラーメッセージ定数
- `UI`: DOM要素のキャッシュ

#### ユーティリティ関数
- `fetchWithTimeout()`: タイムアウト付きfetch
- `truncateTitle()`: チャンネルタイトル切り捨て（サロゲートペア対応）
- `parseLimit()`: 取得件数のパース
- `getNodeText()`: XMLノードテキスト取得

#### 入力処理
- `normalizeInput()`: チャンネルID抽出
- `parseChannelInput()`: 入力パース（valid/invalid分離）

#### データ取得
- `fetchWithProxy()`: CORSプロキシ経由fetch（フォールバック機能付き）
- `fetchChannelVideos()`: チャンネル動画取得
- `entryToVideo()`: XMLエントリー→動画オブジェクト変換

#### 並列処理
- `runWithLimit()`: Promise pool（順序保証）
- `runChannelFetches()`: 複数チャンネル並列取得

#### UI更新
- `setLoadingState()`: ローディング状態管理
- `clearOutputs()`: 出力エリアクリア
- `renderResults()`: 結果表示
- `createOutputBlock()`: 出力ブロック作成
- `createErrorItem()`: エラー要素作成
- `renderErrors()`: エラー表示（集約機能付き）
- `showGlobalError()`: グローバルエラー表示
- `formatErrorMessage()`: エラーメッセージフォーマット

#### メインロジック
- `handleFetch()`: 取得ボタンのハンドラー

### style.css
- レスポンシブデザイン
- コンテナスタイル
- フォーム要素スタイル
- ボタンスタイル
- ローディングインジケータースタイル
- エラー表示スタイル
- 結果表示スタイル
- コードブロックスタイル

## 主要な機能フロー

### 1. データ取得フロー
```
ユーザー入力
  ↓
parseChannelInput() - 入力パース
  ↓
normalizeInput() - チャンネルID抽出
  ↓
runChannelFetches() - 並列取得開始
  ↓
fetchChannelVideos() - 個別チャンネル取得
  ↓
fetchWithProxy() - CORS Proxy経由fetch
  ↓
DOMParser - XML パース
  ↓
entryToVideo() - 動画オブジェクト変換
  ↓
renderResults() - 結果表示
```

### 2. エラーハンドリングフロー
```
エラー発生
  ↓
エラー集約
  ↓
同一エラーのグルーピング
  ↓
renderErrors() - エラー表示
```

## 依存関係

### 外部依存
- YouTube RSS Feed API（`https://www.youtube.com/feeds/videos.xml?channel_id=...`）
- CORS Proxy サービス:
  - `allorigins.win`（プライマリ）
  - `corsproxy.io`（フォールバック）

### ブラウザAPI
- Fetch API
- DOMParser
- AbortController
- Clipboard API
- ARIA（アクセシビリティ）

## 設計パターン

### Promise Pool パターン
- 同時実行数を制限（`CONCURRENCY_LIMIT = 3`）
- 順序を保証しながら並列処理

### Fallback パターン
- CORS Proxyのフォールバック機能
- プライマリが失敗した場合、セカンダリを試行

### UI要素キャッシュパターン
- `UI` オブジェクトでDOM要素をキャッシュ
- 繰り返しのDOM参照を回避

### エラー集約パターン
- 同一エラーをグルーピング
- ユーザーフレンドリーな表示
