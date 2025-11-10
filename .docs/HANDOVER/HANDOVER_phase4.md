# 🔄 引き継ぎプロンプト

以下のプロンプトを次のセッションの最初にコピペしてください：

---
# プロジェクト引き継ぎ：Video URL List Tool

## 📋 プロジェクト概要
YouTube チャンネルの動画情報（URL・タイトル・公開日）を取得するWebアプリ。
- 技術スタック：Pure HTML/CSS/JavaScript（フレームワーク不使用）
- デプロイ：Cloudflare Pages（main ブランチ）
- Workers：CORS Proxy + YouTube Data API 統合
- リポジトリ：Public
- 本番URL：https://youtubelisttool.pages.dev

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
- `workers/youtube-proxy.js`: `/resolve-channel` エンドポイント追加
- `app.js`: `resolveUsername()` 関数追加、`normalizeInput()` を非同期化
- `.gitignore`: `.dev.vars` 追加（APIキー保護）

**対応している入力形式：**
```
@mkbhd                                        ✅
UCBJycsmduvYEL83R_U4JriQ                      ✅
https://www.youtube.com/channel/UC...         ✅
```

### ✅ フェーズ3.5: Workersセキュリティ強化とキャッシュ最適化（完了）

**このフェーズで実装した内容：**

#### 1️⃣ **CORS設定の堅牢化**
- URL解析ベースの厳格なOriginチェック
- Preview環境（*.youtubelisttool.pages.dev）自動対応
- 不許可Originを403で明示的に拒否

**実装箇所：**
```javascript
// 新規関数: isOriginAllowed()
// 修正関数: getAllowedOrigin()
// 追加処理: 26-36行目（403拒否）
```

#### 2️⃣ **Cloudflare Cache実装**
- RSS取得：5分間エッジキャッシュ
- @username解決：24時間キャッシュ
- データのみをキャッシュ、CORSヘッダは毎回動的生成

**効果：**
- YouTube API クォータを大幅削減
- レスポンス速度向上
- 本番環境で `X-Cache: HIT` 確認済み ✅

#### 3️⃣ **@username バリデーション**
- 入力形式チェック（英数字、_, -, . のみ、3-30文字）
- 大小文字正規化（YouTubeは大小文字を区別しない）
- 無効な入力での無駄なAPI呼び出し防止

#### 4️⃣ **セキュリティヘッダ追加**
- `Vary: Origin` → キャッシュの取り違え防止
- `X-Content-Type-Options: nosniff` → XSS攻撃防止
- `X-Cache` → デバッグ用（HIT/MISS表示）

**変更統計：**
- `workers/youtube-proxy.js`: 275行 → 399行（+124行）
- コミット: `0b4bcf9`
- PR: #4（マージ済み）
- 本番デプロイ: 完了 ✅

**テスト結果：**
- ✅ Preview環境で全機能テスト成功
- ✅ 本番環境でキャッシュ動作確認（X-Cache: HIT）
- ✅ @username バリデーション動作確認
- ✅ セキュリティヘッダ動作確認

## 🔮 今後のフェーズ（未実装）

### フェーズ4: ダークモード
- CSS変数化（カラースキーム分離）
- `prefers-color-scheme` 対応（システム設定自動検出）
- 手動切り替えトグル（ユーザーが自由に変更可能）
- `localStorage` で設定永続化
- コントラスト比確認（アクセシビリティ）

**推定作業時間：** 1-2時間

**実装ファイル：**
- `style.css`: CSS変数定義、ダーク/ライトテーマ
- `index.html`: トグルボタン追加
- `app.js`: テーマ切り替えロジック、localStorage連携

### フェーズ5: 日付範囲フィルター
- 日付入力フォーム（開始日・終了日）
- フィルタリングロジック実装
- 取得最適化（日付下限到達時の早期停止）
- UI/UX の調整

**推定作業時間：** 2-3時間

**実装ファイル：**
- `index.html`: 日付入力フォーム追加
- `app.js`: フィルタリングロジック、最適化処理
- `style.css`: フォームスタイル

## 📂 プロジェクト構造

```
/mnt/c/Users/littl/app-dev/05_YouTubeListTool/YouTubeListTool/
├── index.html              # メインUI
├── app.js                  # コアロジック（約700行）
├── style.css               # スタイル（238行）
├── wrangler.toml           # Workers設定
├── .dev.vars               # ローカル開発用環境変数（Git管理外）
├── workers/
│   └── youtube-proxy.js    # CORS Proxy + @username解決（399行）
├── README.md               # ユーザー向けドキュメント
├── CLAUDE.md               # 開発ルール（AI用）
├── HANDOVER.md             # フェーズ1引き継ぎドキュメント
├── HANDOVER_phase2.md      # フェーズ2引き継ぎドキュメント
├── HANDOVER_phase3.md      # フェーズ3引き継ぎドキュメント
├── HANDOVER_phase4.md      # フェーズ4引き継ぎドキュメント（このファイル）
└── IMPLEMENTATION_PLAN.md  # 実装計画
```

## ⚙️ 重要な設定情報

### Cloudflare Workers
- **Worker URL**: `https://youtube-list-tool-proxy.littlelit-3.workers.dev`
- **バージョンID**: `73e9216a-7789-4ed0-8275-29ade2671b7a`
- **エンドポイント**:
  - `/` (ルート): CORS Proxy（RSS取得）
  - `/resolve-channel`: @username → チャンネルID 変換
- **環境変数**: `YOUTUBE_API_KEY`（wrangler secret で設定済み）
- **キャッシュ設定**:
  - RSS: 5分（Cloudflare Cache API）
  - @username: 24時間（Cache API、データのみ保存）

### Cloudflare Pages
- **本番URL**: `https://youtubelisttool.pages.dev`
- **デプロイブランチ**: main
- **自動デプロイ**: main へのプッシュで自動的にデプロイ
- **Preview環境**: PR作成時に自動生成（https://ランダム文字列.youtubelisttool.pages.dev）

### YouTube Data API v3
- **APIキー**: Google Cloud Console で管理
- **制限設定**:
  - アプリケーションの制限: なし（Workers対応のため）
  - API の制限: YouTube Data API v3 のみ
- **無料枠**: 1日10,000リクエスト
- **クォータ節約**: キャッシュ実装により大幅に削減

### 環境変数の管理
```bash
# ローカル開発
.dev.vars ファイルに記載
YOUTUBE_API_KEY=AIzaSy...

# 本番環境（Cloudflare Workers）
wrangler secret put YOUTUBE_API_KEY
```

### CORS設定（workers/youtube-proxy.js）
```javascript
// 許可されるOrigin
const ALLOWED_ORIGINS = [
  'http://localhost:8000',
  'http://localhost:3000',
  'http://127.0.0.1:8000',
  'https://youtubelisttool.pages.dev',
];

// Preview環境は自動許可（*.youtubelisttool.pages.dev）
```

## ⚠️ 重要な注意事項

### Git 運用ルール（CLAUDE.md より）
- ✅ 絶対に自動で git commit や git push を実行しない
- ✅ 変更は必ず差分を提示してユーザーの承認を得る
- ✅ ユーザーがローカルで手動実行（または Cursor UI から実行）

### 現在のブランチ状態
- **Current branch**: main（最新）
- **状態**: フェーズ1〜3.5 の変更がすべて main にマージ済み
- **本番環境**: すべての機能が稼働中 ✅

### セキュリティ
- ✅ `.dev.vars` は `.gitignore` に追加済み（APIキー保護）
- ✅ Workers のシークレットは暗号化されて保存
- ✅ ALLOWED_ORIGINS + Preview環境でアクセス元を制限
- ✅ YouTube RSS URL のみ許可（オープンプロキシ防止）
- ✅ @username バリデーション実装（無効な入力を拒否）
- ✅ セキュリティヘッダ実装（Vary: Origin, X-Content-Type-Options）

### 環境情報
- **OS**: WSL2（Linux）
- **パス**: /mnt/c/Users/littl/app-dev/05_YouTubeListTool/YouTubeListTool
- **Node.js**: インストール済み
- **Wrangler**: 4.45.4（インストール済み）
- **ローカルサーバー**: `npx http-server -p 8000 -c-1`

## 🎯 次のセッションでの選択肢

### Option 1: フェーズ4（ダークモード）に進む
**実装内容：**
- CSS変数を使ったカラースキーム定義
- `prefers-color-scheme` メディアクエリ対応
- ユーザーが手動で切り替えられるトグルボタン
- `localStorage` で設定を永続化
- コントラスト比確認（WCAG AA準拠）

**推定作業時間：** 1-2時間

**開発フロー：**
1. dev_API ブランチで開発
2. ローカルでテスト
3. PR作成 → Preview環境でテスト
4. main にマージ → 本番デプロイ

### Option 2: フェーズ5（日付範囲フィルター）に進む
**実装内容：**
- 日付入力フォーム（開始日・終了日）
- フィルタリングロジック実装（UTCとローカル日付の適切な処理）
- 取得最適化（日付下限到達時の早期停止でAPI節約）
- UI/UX の調整（件数表示、クリアボタン）

**推定作業時間：** 2-3時間

**開発フロー：**
1. dev_API ブランチで開発
2. ローカルでテスト
3. PR作成 → Preview環境でテスト
4. main にマージ → 本番デプロイ

### Option 3: 他の改善・機能追加
ユーザーが気になる点や追加したい機能があれば実装

## 📞 ユーザーの特徴
- 非エンジニア
- 詳細でわかりやすい説明が必要
- 日常生活の例えを使うと理解しやすい
- コマンドはコピペできる形で提示
- 各ステップで確認を取りながら進める
- 「なぜそうするのか」の理解を重視

## 💬 最初の質問例

「フェーズ3.5（セキュリティ強化とキャッシュ最適化）まで完了し、本番環境にデプロイ済みです。次は何をしたいですか？」

**選択肢を提示：**
1. フェーズ4（ダークモード）に進む
2. フェーズ5（日付範囲フィルター）に進む
3. 他の改善・機能追加
4. 現在の状態を確認・テストしたい

## 🔧 トラブルシューティング

### @username が動かない場合
1. `.dev.vars` にAPIキーが設定されているか確認
2. `wrangler secret list` でシークレットが設定されているか確認
3. Google Cloud Console でAPIキーの制限を確認（「なし」になっているか）
4. Workers が正常にデプロイされているか確認
5. ブラウザの開発者ツールで Network タブを確認（400エラーの詳細を見る）

### Workers のデプロイエラー
```bash
# 再デプロイを試す
wrangler deploy

# 環境を指定してデプロイ
wrangler deploy --env=""

# デプロイ履歴を確認
wrangler deployments list
```

### キャッシュが動作しない場合
```bash
# 開発者ツールで確認
1. F12 で開発者ツールを開く
2. Network タブを開く
3. 「Disable cache」のチェックを外す
4. resolve-channel リクエストの Response Headers を確認
5. X-Cache: HIT/MISS を確認

# 注意: Preview環境ではキャッシュに制限がある場合あり
# 本番環境（https://youtubelisttool.pages.dev）で確認推奨
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

### CORS エラーが出る場合
```bash
# Workers のログを確認
wrangler tail

# 許可されていないOriginからアクセスしていないか確認
# localhost以外のローカルサーバーを使っている場合は
# workers/youtube-proxy.js の ALLOWED_ORIGINS に追加が必要
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

### フェーズ3.5（セキュリティ強化）
- [x] CORS設定をURL解析ベースに変更
- [x] Preview環境自動対応（*.youtubelisttool.pages.dev）
- [x] 不許可Originの403拒否
- [x] Cloudflare Cache実装（RSS: 5分、@username: 24時間）
- [x] @username バリデーション追加
- [x] セキュリティヘッダ追加（Vary, X-Content-Type-Options）
- [x] Git commit 完了
- [x] Workers デプロイ
- [x] PR作成（#4）
- [x] Preview環境でテスト
- [x] main ブランチにマージ
- [x] 本番環境での動作確認
- [x] キャッシュ動作確認（X-Cache: HIT）

### 未完了
- [ ] フェーズ4（ダークモード）
- [ ] フェーズ5（日付範囲フィルター）

## 🎉 最新の成果

**フェーズ3.5で実現したこと：**

✅ **セキュリティの大幅向上**
- 堅牢なCORS設定
- 不正アクセスの明示的拒否
- XSS攻撃防止

✅ **パフォーマンスの大幅改善**
- YouTube API クォータを大幅削減（キャッシュ実装）
- レスポンス速度向上
- 本番環境で X-Cache: HIT 確認済み

✅ **開発体験の向上**
- Preview環境自動対応（PR作成時に自動テスト可能）
- デバッグ用ヘッダ（X-Cache）で状態可視化

✅ **ユーザー体験の向上**
- 適切なバリデーションとエラーメッセージ
- 高速なレスポンス

---

このドキュメントを読み込んで、次のセッションを開始してください 🚀
