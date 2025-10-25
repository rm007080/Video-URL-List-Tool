# YouTube URL List Tool

指定した YouTube チャンネルから動画の URL・タイトル・公開日を取得し、NotebookLM 等に貼り付け可能な形式で出力する軽量ツールです。

## 機能

- YouTube チャンネルから動画情報（URL/タイトル/公開日）を取得
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
