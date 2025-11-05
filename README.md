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

## Cloudflare Workers デプロイ手順（オプション）

自前のCORS Proxyを構築することで、第三者サービスへの依存を減らし、プライバシーリスクを低減できます。

### 前提条件

- Cloudflare アカウント（無料プランでOK）
- Node.js と npm がインストール済み

### 1. Wrangler CLI をインストール

```bash
npm install -g wrangler
```

### 2. Cloudflare にログイン

```bash
wrangler login
```

ブラウザが開くので、Cloudflareアカウントで認証します。

### 3. Worker をデプロイ

```bash
# プロジェクトディレクトリで実行
wrangler deploy
```

### 4. Worker URL を確認

デプロイ後、以下のような URL が表示されます：
```
https://youtube-list-tool-proxy.YOUR_SUBDOMAIN.workers.dev
```

### 5. app.js を更新

1. `app.js` を開く
2. `PROXY_CONFIG` の `Custom Worker` の URL を更新：
   ```javascript
   url: 'https://youtube-list-tool-proxy.YOUR_SUBDOMAIN.workers.dev/?url=',
   ```
3. `enabled` を `true` に変更：
   ```javascript
   enabled: true
   ```

### 6. workers/youtube-proxy.js の ALLOWED_ORIGINS を更新

本番環境の URL を追加：
```javascript
const ALLOWED_ORIGINS = [
  'http://localhost:8000',
  'https://your-actual-domain.pages.dev', // ← あなたの実際のURLに変更
];
```

### 7. 再デプロイ

```bash
wrangler deploy
```

### 8. 動作確認

ブラウザの開発者ツール（F12）→ Console タブで、以下のログが表示されれば成功：
```
✓ Custom Worker succeeded
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

1. **allorigins.win** (https://api.allorigins.win/) - プライマリ
   - MIT ライセンスのオープンソースプロジェクト
   - 利用規約・レート制限は明示されていません

2. **corsproxy.io** (https://corsproxy.io/) - フォールバック
   - 開発用途では無料で使用可能
   - 「production site」での使用には有料プランが必要とされていますが、個人の非商用プロジェクトがこれに該当するかは不明確です
   - 本ツールは非商用の個人プロジェクトとして開発・公開されています

**注意事項:**
- レート制限により一時的に利用できない場合があります
- 第三者サービスのため、ログにチャンネルIDやIPアドレスが記録される可能性があります
- サービス停止時は取得できません
- 各サービスの利用規約は予告なく変更される可能性があります

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

## 利用規約と注意事項

### 利用条件

- 本ツールは個人的な利用および教育目的でのみ使用してください
- 商用利用は禁止されています
- YouTube の利用規約に準拠して使用してください

### プライバシーに関する重要な情報

#### 本ツール使用時に第三者に送信される情報

本ツールを使用すると、以下の情報が自動的に第三者サービスに送信されます：

- **入力したチャンネルID**: ユーザーが明示的に入力したYouTubeチャンネルの識別子
- **IPアドレス**: インターネット接続元の識別情報（おおよその位置情報の推定が可能）
- **アクセス時刻**: ツールを使用した日時
- **ブラウザ情報**: 使用しているブラウザの種類とバージョン

#### 送信先の第三者サービス

上記の情報は以下のサービスに送信されます：

1. **allorigins.win** (https://allorigins.win/) - プライマリCORS Proxy
2. **corsproxy.io** (https://corsproxy.io/) - フォールバック用CORS Proxy
3. **YouTube RSS** (https://www.youtube.com/feeds/videos.xml) - 動画情報の取得元

これらのサービスがどのようにデータを扱うかは、各サービスのプライバシーポリシーに依存します。本アプリケーションの提供者は、第三者サービスのデータ管理について責任を負いません。

#### 本アプリケーション自体によるデータ管理

本アプリケーション自体は：

- ✅ ユーザーデータを保存しません（すべてブラウザ内で処理されます）
- ✅ サーバーログを記録しません
- ✅ Cookie を使用しません
- ✅ アクセス解析を行いません

#### 利用者の同意

本ツールの「取得」ボタンをクリックすることで、上記の情報が第三者サービスに送信されることに同意したものとみなします。

### 免責事項

- 本ツールは無保証で提供されます
- CORS Proxyサービスの停止により機能しなくなる可能性があります
- YouTubeの仕様変更により動作しなくなる可能性があります
- 本ツールの使用により生じた損害について、作成者は一切の責任を負いません

## ライセンス

MIT License

## 開発者向け情報

### ファイル構成

```
.
├── index.html              # メインUIページ
├── style.css               # スタイリング
├── app.js                  # コアロジック（RSS取得・解析）
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
# Test Claude Integration
