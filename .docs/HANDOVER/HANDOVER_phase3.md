# 🔄 引き継ぎプロンプト

以下のプロンプトを次のセッションの最初にコピペしてください：

---
# プロジェクト引き継ぎ：Video URL List Tool

## 📋 プロジェクト概要
YouTube チャンネルの動画情報（URL・タイトル・公開日）を取得するWebアプリ。
- 技術スタック：Pure HTML/CSS/JavaScript（フレームワーク不使用）
- デプロイ：Cloudflare Pages（main ブランチ）
- リポジトリ：Public
- ブランチ：dev_API で開発中

## 🎯 実装フェーズと進捗状況

### ✅ フェーズ1: UI/UX改善（完了）
- エラーメッセージの改善（リトライヒント付き）
- プログレス表示機能（「3/5 チャンネル処理済み」）
- CSVエクスポート機能（XSS対策済み）
- JSONエクスポート機能（メタデータ付き）
- エクスポートボタンUI

**変更ファイル：**
- `app.js`: エラーメッセージ改善、プログレス表示、エクスポート機能追加
- `index.html`: loadingText要素、exportButtons追加
- `style.css`: エクスポートボタンのスタイル追加

### ✅ フェーズ2: 自前CORS Proxy構築（完了）
- Cloudflare Workers で CORS Proxy を実装
- 第三者サービス（allorigins.win, corsproxy.io）への依存を軽減
- セキュリティ強化（YouTube RSS URLのみ許可）
- 本番環境デプロイ済み

**新規ファイル：**
- `wrangler.toml`: Cloudflare Workers 設定
- `workers/youtube-proxy.js`: CORS Proxy実装

**変更ファイル：**
- `app.js`: PROXY_CONFIG 拡張（enabled フラグ、Custom Worker有効化）
- `README.md`: Cloudflare Workers デプロイ手順追加

**現在の状態：**
```javascript
// app.js の PROXY_CONFIG
{
  name: 'Custom Worker',
  url: 'https://youtube-list-tool-proxy.littlelit-3.workers.dev/?url=',
  enabled: true  // ✅ 有効化済み
}
```

### ✅ フェーズ3: @username 対応（完了）
- YouTube Data API v3 統合
- Cloudflare Workers にバックエンド機能追加
- @username → チャンネルID 自動変換
- APIキーの安全な管理（環境変数）

**実装内容：**
- YouTube Data API キー取得・設定
- Workers に `/resolve-channel` エンドポイント追加
- app.js で @username 入力に対応
- ローカル開発用に `.dev.vars` ファイル作成

**新規ファイル：**
- `.dev.vars`: ローカル開発用環境変数（Git管理外）

**変更ファイル：**
- `workers/youtube-proxy.js`: `/resolve-channel` エンドポイント追加（275行 → 約350行）
- `app.js`: `resolveUsername()` 関数追加、`normalizeInput()` を非同期化
- `.gitignore`: `.dev.vars` 追加（APIキー保護）

**APIキー設定：**
- ローカル: `.dev.vars` に `YOUTUBE_API_KEY` を設定
- 本番: `wrangler secret put YOUTUBE_API_KEY` で設定済み
- Google Cloud Console: アプリケーションの制限を「なし」に設定（Workers対応）

**対応している入力形式：**
```
@mkbhd                                        ← 新機能！
UCBJycsmduvYEL83R_U4JriQ                      ← 既存
https://www.youtube.com/channel/UC...         ← 既存
```

**動作確認済み：**
- ✅ ローカル環境（http://localhost:8000）で @username 入力テスト成功
- ✅ Workers の `/resolve-channel` エンドポイント正常動作
- ✅ YouTube Data API 連携正常

## 🔮 今後のフェーズ（未実装）

### フェーズ4: ダークモード
- CSS変数化
- prefers-color-scheme 対応
- 手動切り替えトグル

### フェーズ5: 日付範囲フィルター
- 日付入力フォーム追加
- フィルタリングロジック実装

## 📂 プロジェクト構造

```
/mnt/c/Users/littl/app-dev/05_YouTubeListTool/YouTubeListTool/
├── index.html              # メインUI
├── app.js                  # コアロジック（約700行）
├── style.css               # スタイル（238行）
├── wrangler.toml           # Workers設定
├── .dev.vars               # ローカル開発用環境変数（Git管理外）
├── workers/
│   └── youtube-proxy.js    # CORS Proxy + @username解決（約350行）
├── README.md               # ユーザー向けドキュメント
├── CLAUDE.md               # 開発ルール（AI用）
├── HANDOVER.md             # フェーズ1引き継ぎドキュメント
├── HANDOVER_phase2.md      # フェーズ2引き継ぎドキュメント
├── HANDOVER_phase3.md      # フェーズ3引き継ぎドキュメント（このファイル）
└── IMPLEMENTATION_PLAN.md  # 実装計画
```

## ⚙️ 重要な設定情報

### Cloudflare Workers
- **Worker URL**: `https://youtube-list-tool-proxy.littlelit-3.workers.dev`
- **エンドポイント**:
  - `/` (ルート): CORS Proxy（RSS取得）
  - `/resolve-channel`: @username → チャンネルID 変換
- **環境変数**: `YOUTUBE_API_KEY`（wrangler secret で設定済み）

### Cloudflare Pages
- **本番URL**: `https://youtubelisttool.pages.dev`
- **デプロイブランチ**: main
- **自動デプロイ**: main へのプッシュで自動的にデプロイ

### YouTube Data API v3
- **APIキー**: Google Cloud Console で管理
- **制限設定**:
  - アプリケーションの制限: なし（Workers対応のため）
  - API の制限: YouTube Data API v3 のみ
- **無料枠**: 1日10,000リクエスト

### 環境変数の管理
```bash
# ローカル開発
.dev.vars ファイルに記載
YOUTUBE_API_KEY=AIzaSy...

# 本番環境（Cloudflare Workers）
wrangler secret put YOUTUBE_API_KEY
```

## ⚠️ 重要な注意事項

### Git 運用ルール（CLAUDE.md より）
- ✅ 絶対に自動で git commit や git push を実行しない
- ✅ 変更は必ず差分を提示してユーザーの承認を得る
- ✅ ユーザーがローカルで手動実行（または Cursor UI から実行）

### 現在のブランチ状態
- **Current branch**: dev_API
- **Main branch**: main（Cloudflare Pages と連携）
- **状態**: フェーズ2 & フェーズ3 の変更は dev_API にコミット済み、main にはまだマージしていない

### セキュリティ
- ✅ `.dev.vars` は `.gitignore` に追加済み（APIキー保護）
- ✅ Workers のシークレットは暗号化されて保存
- ✅ ALLOWED_ORIGINS でアクセス元を制限
- ✅ YouTube RSS URL のみ許可（オープンプロキシ防止）

### 環境情報
- **OS**: WSL2（Linux）
- **パス**: /mnt/c/Users/littl/app-dev/05_YouTubeListTool/YouTubeListTool
- **Node.js**: インストール済み
- **Wrangler**: 4.45.4（インストール済み）
- **ローカルサーバー**: `npx http-server -p 8000 -c-1`

## 🎯 次のセッションでの選択肢

### Option 1: main にマージして本番デプロイ
フェーズ2 & フェーズ3 を本番環境に反映

**手順：**
```bash
# dev_API の変更を main にマージ
git checkout main
git merge dev_API
git push origin main

# Cloudflare Pages が自動デプロイ（数分）
```

**確認事項：**
- 本番環境（https://youtubelisttool.pages.dev）で @username が動作するか
- Custom Worker が正常に動作するか

### Option 2: フェーズ4（ダークモード）に進む
**実装内容：**
- CSS変数を使ったカラースキーム定義
- `prefers-color-scheme` メディアクエリ対応
- ユーザーが手動で切り替えられるトグルボタン

**推定作業時間：** 1-2時間

### Option 3: フェーズ5（日付範囲フィルター）に進む
**実装内容：**
- 日付入力フォーム（開始日・終了日）
- フィルタリングロジック実装
- UI/UX の調整

**推定作業時間：** 2-3時間

### Option 4: 他の改善・機能追加
ユーザーが気になる点や追加したい機能があれば実装

## 📞 ユーザーの特徴
- 非エンジニア
- 詳細でわかりやすい説明が必要
- 日常生活の例えを使うと理解しやすい
- コマンドはコピペできる形で提示
- 各ステップで確認を取りながら進める
- 「なぜそうするのか」の理解を重視

## 💬 最初の質問例

「フェーズ3まで完了しています。次は何をしたいですか？」

**選択肢を提示：**
1. main にマージして本番デプロイ
2. フェーズ4（ダークモード）に進む
3. フェーズ5（日付範囲フィルター）に進む
4. 他の改善・機能追加

## 🔧 トラブルシューティング

### @username が動かない場合
1. `.dev.vars` にAPIキーが設定されているか確認
2. `wrangler secret list` でシークレットが設定されているか確認
3. Google Cloud Console でAPIキーの制限を確認（「なし」になっているか）
4. Workers が正常にデプロイされているか確認

### Workers のデプロイエラー
```bash
# 再デプロイを試す
wrangler deploy

# 環境を指定してデプロイ
wrangler deploy --env=""
```

### ローカルで動作確認する方法
```bash
# ローカルサーバー起動
cd /mnt/c/Users/littl/app-dev/05_YouTubeListTool/YouTubeListTool
npx http-server -p 8000 -c-1

# ブラウザで開く
http://localhost:8000

# 開発者ツール（F12）で Console を確認
# "Custom Worker succeeded" が表示されれば正常
```

## 📊 完了したタスクのチェックリスト

### フェーズ1
- [x] エラーメッセージ改善
- [x] プログレス表示
- [x] CSV/JSONエクスポート機能

### フェーズ2
- [x] Cloudflare Workers 実装
- [x] Workers デプロイ
- [x] app.js で Custom Worker 有効化
- [x] ローカル環境で動作確認

### フェーズ3
- [x] YouTube Data API キー取得
- [x] APIキーを Workers に設定
- [x] `/resolve-channel` エンドポイント実装
- [x] app.js で @username 対応
- [x] YouTube API の制限設定修正
- [x] ローカル環境で動作確認
- [x] Git commit 完了

### 未完了
- [ ] main ブランチにマージ
- [ ] 本番環境での動作確認
- [ ] フェーズ4（ダークモード）
- [ ] フェーズ5（日付範囲フィルター）

---

このドキュメントを読み込んで、次のセッションを開始してください 🚀
