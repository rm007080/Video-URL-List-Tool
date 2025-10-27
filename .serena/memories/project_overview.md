# YouTube List Tool - プロジェクト概要

## プロジェクト名
**YouTube List Tool** - YouTube チャンネルから動画情報を取得するツール

## 目的
YouTube チャンネルの動画情報（URL、タイトル、公開日）を取得し、NotebookLM などにコピー&ペーストしやすい形式で出力する軽量ツール。

## 技術スタック

### フロントエンド
- **Pure HTML/CSS/JavaScript**（フレームワーク不使用）
- ブラウザネイティブAPI（Fetch API, DOMParser, Clipboard API）
- アクセシビリティ対応（ARIA属性、WCAG AAA準拠）

### インフラ
- **Cloudflare Pages**（静的サイトホスティング）
- **GitHub Actions**（自動デプロイ）
- **CORS Proxy**: `allorigins.win`, `corsproxy.io`（外部依存）

### データソース
- **YouTube RSS Feed**（`https://www.youtube.com/feeds/videos.xml?channel_id=...`）
- APIキー不要
- 最新15件程度の動画情報を取得可能（YouTube仕様）

## プログラミング言語
- JavaScript（Pure JavaScript、フレームワーク不使用）
- HTML5
- CSS3

## 本番環境
- Production: `https://youtube-list-tool.pages.dev`
- GitHub: `rm007080/YouTubeListTool`
- メインブランチ: `main`

## 実装済み機能
- チャンネルID/URLからの動画情報取得
- 複数チャンネル一括取得（1行1件）
- 取得件数指定（5件/10件/15件）
- URLs/Titles/Published Datesの整形出力
- ワンクリックコピー機能
- CORS対策: 複数プロキシのフォールバック機能
- セキュリティ: RSS改ざん検証（チャンネルID/URL検証）
- パフォーマンス: Promise pool（同時3件制限）、配列走査最適化
- エラーハンドリング: エラー集約、同一エラーのグルーピング
- アクセシビリティ: aria-live、WCAG AAA対応、スクリーンリーダー対応
