これはテストです
# Video URL List Tool

YouTube チャンネルに対応した動画情報取得ツール。指定したチャンネルから動画の URL・タイトル・公開日を取得し、NotebookLM 等に貼り付け可能な形式で出力します。

**本番環境**: https://youtubelisttool.pages.dev

## ✨ 新機能（Phase 6）

### 段階的ロード（Progressive Loading）
- **取得可能件数**: 最大500件以上（以前は15件まで）
- **取得範囲選択**: 15件、50件、100件、500件、全件から選択可能
- **自動切り替え**:
  - 15件以下: 高速なRSS取得（クォータ消費なし）
  - 16件以上: YouTube Data API v3使用（段階的ロード）

### プログレス表示
- **プログレスバー**: 0%〜100%のリアルタイム進捗表示
- **チャンネル名表示**: 現在取得中のチャンネル名を表示
- **キャンセル機能**: 長時間取得を中断可能
- **さらに読み込み**: nextPageTokenで追加取得

### @username対応
- **ハンドル入力**: `@GoogleDevelopers` のような@username形式に対応
- **自動解決**: チャンネルIDへ自動変換

### その他の機能
- **日付範囲フィルター**: 開始日・終了日を指定して動画を絞り込み
- **エクスポート**: CSV/JSON/テキスト形式でダウンロード
- **ダークモード**: システム設定に自動対応＋手動切り替え
- **レスポンシブデザイン**: スマホ・タブレット・デスクトップ対応

---

## 📊 API使用とクォータ

| 取得件数 | 使用API | クォータ消費 | 取得時間目安 |
|---------|---------|-------------|-------------|
| 15件以下 | RSS | 0ユニット | 約2秒 |
| 50件 | API | 約2ユニット | 約5秒 |
| 100件 | API | 約3ユニット | 約10秒 |
| 500件 | API | 約11ユニット | 約50秒 |

**YouTube Data API v3 クォータ上限**: 10,000ユニット/日（太平洋時間の深夜0時にリセット）

---

## 🚀 使い方

### 基本的な使い方

1. **チャンネル入力**: テキストエリアにチャンネルIDまたはURLを入力（1行1件）
2. **取得件数選択**: 15件、50件、100件、500件、全件から選択
3. **取得ボタン**: 「取得」ボタンをクリック
4. **結果コピー**: 表示された結果をコピーしてNotebookLM等に貼り付け

### 対応入力形式

#### ✅ 対応
- `UC1234567890abcdefghij` - チャンネルID（UC + 22文字）
- `https://www.youtube.com/channel/UC...` - チャンネルURL
- `@GoogleDevelopers` - @username（ハンドル形式）✨ **NEW**
- `https://www.youtube.com/@username` - @username付きURL

#### ❌ 非対応
- `/c/channelname` - カスタムURL（廃止された形式）

---

## 💻 ローカル実行手順

### 1. リポジトリをクローン

```bash
git clone https://github.com/rm007080/Video-URL-List-Tool.git
cd Video-URL-List-Tool
```

### 2. ローカルサーバーを起動

CORS制限を回避するため、ローカルサーバーで実行してください。

#### Node.js（推奨）

```bash
npx http-server -p 8000 -c-1
```

#### Python 3.x

```bash
python -m http.server 8000
```

### 3. ブラウザでアクセス

```
http://localhost:8000/
```

---

## 🔧 Cloudflare Workers + Pages デプロイ手順

### 前提条件

- Cloudflare アカウント（無料プランでOK）
- Node.js と npm がインストール済み
- YouTube Data API v3 のAPIキー（Google Cloud Console）

### 1. YouTube Data API v3 のAPIキー取得

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを作成または選択
3. 「APIとサービス」→「ライブラリ」→「YouTube Data API v3」を有効化
4. 「認証情報」→「認証情報を作成」→「APIキー」
5. APIキーをコピー（後で使用）

### 2. Wrangler CLI をインストール

```bash
npm install -g wrangler
```

### 3. Cloudflare にログイン

```bash
wrangler login
```

ブラウザが開くので、Cloudflareアカウントで認証します。

### 4. APIキーを設定

```bash
wrangler secret put YOUTUBE_API_KEY
```

プロンプトでAPIキーを貼り付けます。

### 5. Worker をデプロイ

```bash
wrangler deploy
```

デプロイ後、Worker URLが表示されます：
```
https://youtube-list-tool-proxy.YOUR_SUBDOMAIN.workers.dev
```

### 6. Cloudflare Pages にデプロイ

1. GitHubリポジトリをフォーク
2. [Cloudflare Dashboard](https://dash.cloudflare.com/) → Pages
3. 「Create a project」→「Connect to Git」
4. フォークしたリポジトリを選択
5. ビルド設定:
   - Build command: （空欄）
   - Build output directory: `/`
6. 「Save and Deploy」

### 7. 動作確認

デプロイされたPages URL（`https://your-project.pages.dev`）にアクセスして動作確認。

---

## ⚙️ カスタマイズ

### 並列実行数を変更

`app.js` の `CONCURRENCY_LIMIT` を編集：

```javascript
const CONCURRENCY_LIMIT = 5; // 同時5件に変更
```

### Workers URLを変更

`app.js` の `PROXY_CONFIG` を編集：

```javascript
{
  name: 'Custom Worker',
  url: 'https://your-worker.workers.dev/?url=',
  enabled: true,
  timeout: 15000
}
```

---

## ⚠️ トラブルシューティング

### クォータ超過エラーが出る場合

**エラーメッセージ**: 「1日の無料枠（10,000クォータ）を超過しました」

**対処法**:
1. 翌日まで待つ（太平洋時間の深夜0時にリセット）
2. 取得件数を減らす（15件以下ならRSS使用でクォータ消費なし）
3. 複数のGoogleアカウントで別のAPIキーを取得（非推奨）

---

### @username解決が失敗する場合

**エラーメッセージ**: 「チャンネルが見つかりませんでした」

**対処法**:
1. チャンネルIDを直接入力（UCで始まる24文字）
2. チャンネルページURLから取得:
   - YouTubeでチャンネルページを開く
   - URLバーから `https://www.youtube.com/channel/UCxxxxxx` の形式でコピー
3. ページのソースを表示（Ctrl+U）して `"channelId":"UC..."` を検索

---

### APIレート制限エラー

**エラーメッセージ**: 「APIのレート制限に達しました」

**対処法**:
1. 数分待ってから再試行
2. 一度に取得するチャンネル数を減らす
3. 取得間隔を空ける

---

### 古いデータがキャッシュされている

**症状**: 更新したのに古いバージョンが表示される

**対処法**:
1. **ハードリロード**:
   - Windows/Linux: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`
2. **キャッシュクリア**:
   - Chrome: DevToolsを開く → リロードボタン長押し → 「キャッシュの消去とハード再読み込み」
   - Safari: 開発メニュー → キャッシュを空にする
   - Firefox: `Ctrl + Shift + Delete` → キャッシュを削除

---

## 🔒 セキュリティ

### 実装済みのセキュリティ対策

- ✅ **XSS対策**: `textContent` のみ使用、`innerHTML` は使用していません
- ✅ **入力バリデーション**: 正規表現でチャンネルID形式をチェック
- ✅ **CORS設定**: 許可されたオリジンのみアクセス可能
- ✅ **レート制限**: Durable Objectsでリクエスト制限
- ✅ **タイムアウト設定**: 各リクエストは15秒でタイムアウト
- ✅ **Content-Type検証**: 不正なレスポンスを検出

### プライバシー

本アプリケーション自体は：
- ✅ ユーザーデータを保存しません（すべてブラウザ内で処理）
- ✅ Cookie を使用しません
- ✅ アクセス解析を行いません（Cloudflareの基本的なログのみ）

### 送信される情報

本ツールを使用すると、以下の情報がCloudflare Workers経由でYouTube APIに送信されます：
- 入力したチャンネルID または @username
- APIキー（Workersに保存、ブラウザには送信されません）
- リクエストメタデータ（IPアドレス、User-Agent等）

---

## 📄 ライセンス

MIT License

---

## 🛠️ 開発者向け情報

### ファイル構成

```
.
├── index.html                  # メインUIページ
├── style.css                   # スタイリング（686行）
├── app.js                      # コアロジック（1377行）
├── workers/
│   └── youtube-proxy.js        # Cloudflare Workers（1162行）
├── wrangler.toml               # Workers設定
├── .docs/
│   ├── DEPLOYMENT_CHECKLIST.md # デプロイチェックリスト
│   └── HANDOVER/               # 開発ハンドオーバードキュメント
├── README.md                   # このファイル
├── CLAUDE.md                   # 開発ルール
└── LICENSE                     # MITライセンス
```

### 技術スタック

**フロントエンド**:
- Vanilla JavaScript (ES6+)
- CSS Variables（ダークモード対応）
- Fetch API + AbortController
- DOMParser API（XML解析）

**バックエンド**:
- Cloudflare Workers（サーバーレス）
- Durable Objects（レート制限・状態管理）
- YouTube Data API v3
- YouTube RSS Feed

**デプロイ**:
- Cloudflare Pages（静的ホスティング）
- Cloudflare Workers（API Proxy）
- GitHub Actions（CI/CD）

### コード統計

- **合計行数**: 約3,225行
- **app.js**: 1,377行（重複コード削除後）
- **style.css**: 686行
- **workers/youtube-proxy.js**: 1,162行

### 主要な設計パターン

- **Promise Pool**: 並列リクエスト制御（`CONCURRENCY_LIMIT`）
- **Abort Controller**: キャンセル・タイムアウト制御
- **Progressive Loading**: 段階的データ取得・UI更新
- **Error Handling**: 構造化エラーコード（`ok`, `code`, `message`）

---

## 📞 サポート

- **Issue報告**: [GitHub Issues](https://github.com/rm007080/Video-URL-List-Tool/issues)
- **本番環境**: https://youtubelisttool.pages.dev
- **Workers URL**: https://youtube-list-tool-proxy.littlelit-3.workers.dev

---

## 🎯 今後の予定（Phase 7以降）

### 高優先度
- [ ] キャッシュ実装（@username解決: 7日TTL）
- [ ] エラーメッセージの改善（リカバリー提案）
- [ ] 入力バリデーション強化

### 中優先度
- [ ] プレイリスト対応
- [ ] 動画詳細情報取得（再生回数、いいね数）
- [ ] フィルタリング機能（タイトルキーワード検索）

### 低優先度
- [ ] 仮想リスト実装（1000件以上対応）
- [ ] パフォーマンス最適化
- [ ] 多言語対応（英語UI）

---

**最終更新**: 2025-11-11
**バージョン**: Phase 6 (v1.2.0)
**作成者**: rm007080
