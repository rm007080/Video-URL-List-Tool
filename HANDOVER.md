# 🔄 YouTubeListTool プロジェクト引き継ぎドキュメント

最終更新日: 2025-10-26

---

## 📋 プロジェクト概要

### プロジェクト名
**YouTube List Tool** - YouTube チャンネルから動画情報を取得するツール

### 目的
YouTube チャンネルの動画情報（URL、タイトル、公開日）を取得し、NotebookLM などにコピー&ペーストしやすい形式で出力する軽量ツール。

### 本番URL
デプロイ済み（Cloudflare Pages）
- Production: `https://youtube-list-tool.pages.dev`（または設定したカスタムドメイン）

### リポジトリ
- GitHub: `rm007080/YouTubeListTool`
- メインブランチ: `main`
- 開発ブランチ: `レビューなし実装`（マージ済みまたは運用中）

---

## 🏗️ 技術スタック

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

---

## 📂 ディレクトリ構造

```
YouTubeListTool/
├── index.html              # メインHTML（UIとフォーム）
├── app.js                  # JavaScriptロジック（16KB、512行）
├── style.css               # スタイルシート（3KB）
├── README.md               # ユーザー向けドキュメント
├── CLAUDE.md               # 開発ルール（必読）
├── HANDOVER.md             # 本ドキュメント
├── LICENSE                 # MITライセンス
├── .gitignore              # Git除外設定
├── .git/                   # Gitリポジトリ
├── .claude/                # Claude Code設定（Git除外）
└── screenshots/            # スクリーンショット保存用（Git除外）
```

---

## 🎯 実装済み機能

### コア機能
- [x] チャンネルID/URLからの動画情報取得
- [x] 複数チャンネル一括取得（1行1件）
- [x] 取得件数指定（5件/10件/15件）
- [x] URLs/Titles/Published Datesの整形出力
- [x] ワンクリックコピー機能

### 技術的な特徴
- [x] **CORS対策**: 複数プロキシのフォールバック機能
- [x] **セキュリティ**: RSS改ざん検証（チャンネルID/URL検証）
- [x] **パフォーマンス**: Promise pool（同時3件制限）、配列走査最適化
- [x] **エラーハンドリング**: エラー集約、同一エラーのグルーピング
- [x] **アクセシビリティ**: aria-live、WCAG AAA対応、スクリーンリーダー対応
- [x] **コード品質**: UI要素キャッシュ、エラーメッセージ定数化、関数分割

### UI/UX
- [x] レスポンシブデザイン
- [x] ローディングインジケーター
- [x] エラー表示（ユーザーフレンドリー）
- [x] セマンティックHTML（ul/li構造）

---

## 🔧 重要な設計決定

### 1. Pure JavaScript採用
**理由**:
- ビルドプロセス不要
- 依存関係なし
- デプロイが簡単
- 学習コストが低い

**トレードオフ**:
- 大規模化には不向き
- 型安全性なし

### 2. CORS Proxy依存
**現状**: `allorigins.win` → `corsproxy.io` のフォールバック

**リスク**:
- 外部サービス停止時に全機能停止
- レート制限の可能性
- プライバシー懸念（チャンネルIDが送信される）

**将来の改善案**:
- Cloudflare Workers で独自プロキシ実装（推奨）
- YouTube Data API への移行（APIキー必要）

### 3. エラーメッセージの定数化
**実装箇所**: `app.js:14-28`

**メリット**:
- ローカライズが容易
- 一貫性の確保
- テストしやすい

### 4. UI要素のキャッシュ
**実装箇所**: `app.js:30-37`

**メリット**:
- DOM参照の一元管理
- パフォーマンス向上
- コードの可読性向上

---

## 📝 コードのキーポイント

### app.js の主要関数

#### UI管理
```javascript
const UI = { ... }              // DOM要素キャッシュ
setLoadingState(isLoading)      // ローディング状態管理
clearOutputs()                  // 出力エリアクリア
parseLimit(value)               // 取得件数パース
```

#### 入力処理
```javascript
normalizeInput(input)           // チャンネルID抽出
parseChannelInput(rawInput)     // 入力パース（valid/invalid分離）
```

#### データ取得
```javascript
fetchWithTimeout(url, timeout)  // タイムアウト付きfetch
fetchWithProxy(targetUrl)       // CORSプロキシ経由fetch
fetchChannelVideos(channelId)   // チャンネル動画取得
```

#### パース
```javascript
getNodeText(parent, selector)   // XMLノードテキスト取得
entryToVideo(entry)             // XMLエントリー→動画オブジェクト変換
```

#### 並列処理
```javascript
runWithLimit(items, limit, task) // Promise pool（順序保証）
runChannelFetches(validInputs)   // 複数チャンネル並列取得
```

#### UI更新
```javascript
renderResults(resultsData)      // 結果表示
createOutputBlock(title, content) // 出力ブロック作成
createErrorItem({ message })    // エラー要素作成
renderErrors(errorsData)        // エラー表示（集約機能付き）
showGlobalError(error)          // グローバルエラー表示
```

---

## ⚠️ 既知の制限事項と懸念点

### 1. CORS Proxy への依存 🔴
**問題**: 外部サービスが停止すると全機能停止
**影響度**: High
**対策**: Cloudflare Workers で独自プロキシ実装を推奨

### 2. YouTube RSS の制限
**問題**: 最新15件程度しか取得できない
**影響度**: Medium
**対策**: YouTube Data API 移行（APIキー必要）

### 3. @username 非対応
**問題**: `@handle` 形式のチャンネル指定ができない
**影響度**: Low
**対策**: YouTube Data API で解決可能

### 4. プライバシー懸念
**問題**: チャンネルIDがCORS Proxyに送信される
**影響度**: Low（個人利用なら問題なし）
**対策**: 独自プロキシ実装

### 5. ブラウザ互換性
**対象**: モダンブラウザのみ（IE非対応）
**必要機能**: Fetch API, DOMParser, Clipboard API, Optional Chaining
**影響度**: Low（現代的なブラウザは全て対応）

---

## 🚀 デプロイ情報

### Cloudflare Pages 設定
```
Project name:           youtube-list-tool
Production branch:      main
Framework preset:       None
Build command:          （空欄）
Build output directory: /
Environment variables:  （設定不要）
```

### 自動デプロイ
- `main` ブランチへのpushで自動デプロイ
- デプロイ時間: 約30秒〜1分
- ビルドログ: Cloudflare Pagesダッシュボードで確認可能

### カスタムドメイン
- 設定方法: Cloudflare Pages → Custom domains
- SSL証明書: 自動発行

---

## 🔐 セキュリティ

### 実装済み
- [x] XSS対策（textContentのみ使用、innerHTMLは禁止）
- [x] RSS改ざん検証（チャンネルID検証、URL検証）
- [x] タイムアウト制御（10秒）
- [x] エラーハンドリング（全API呼び出し）

### 注意点
- APIキーなし（環境変数不要）
- ブラウザ側で完結（サーバーサイド処理なし）
- シークレット情報なし

---

## 📚 重要ドキュメント

### 必読
1. **CLAUDE.md** - 開発ルール（絶対に守ること）
   - 自動commit/push禁止
   - 変更前に差分提示
   - シークレットのハードコーディング禁止

2. **README.md** - ユーザー向け使い方
   - ローカルサーバー起動方法
   - チャンネルID確認方法
   - CORS対策の説明

---

## 🛠️ 開発環境

### 推奨環境
- WSL2 (Ubuntu)
- Claude Code
- Git
- Python 3（ローカルサーバー用: `python -m http.server 8000`）

### ローカル開発手順
```bash
# リポジトリクローン
git clone https://github.com/rm007080/YouTubeListTool.git
cd YouTubeListTool

# ローカルサーバー起動
python -m http.server 8000

# ブラウザでアクセス
# http://localhost:8000
```

### テスト手順
1. ローカルサーバー起動
2. 有効なチャンネルIDを入力（例: `UCqm-hTLLmPbB2e7z6sG3Zrg`）
3. 「取得」ボタンクリック
4. URLs/Titles/Datesが表示されることを確認
5. コピーボタンの動作確認
6. エラーケースのテスト（不正な入力、@username など）

---

## 📈 今後の改善提案

### 優先度: High
1. **独自CORSプロキシの実装**（Cloudflare Workers）
   - 外部依存の解消
   - プライバシー保護
   - 安定性向上

2. **エラーログの収集**（Cloudflare Analytics）
   - ユーザーがどこで躓いているか把握
   - CORS Proxy失敗率のモニタリング

### 優先度: Medium
3. **YouTube Data API 統合**（オプション機能）
   - @username 対応
   - 詳細情報取得（再生回数、いいね数など）
   - プレイリスト対応

4. **PWA化**
   - オフライン対応
   - インストール可能に

5. **UI改善**
   - ダークモード
   - 多言語対応
   - 結果のエクスポート（CSV、JSON）

### 優先度: Low
6. **TypeScript移行**
   - 型安全性
   - エディタサポート改善

7. **テストコード追加**
   - ユニットテスト（Jest）
   - E2Eテスト（Playwright）

---

## 🔄 Git ワークフロー

### ブランチ戦略
- `main` - 本番ブランチ（Cloudflare Pagesと連携）
- `レビューなし実装` - 開発ブランチ（必要に応じて使用）
- 機能追加時は feature/* ブランチを推奨

### コミットメッセージ規約
```
<type>: <subject>

<body>

例:
feat: 独自CORSプロキシ実装

- Cloudflare Workersでプロキシ作成
- allorigins.winへの依存を解消
- プライバシー保護を改善
```

**Type**:
- `feat`: 新機能
- `fix`: バグ修正
- `refactor`: リファクタリング
- `docs`: ドキュメント更新
- `style`: コードスタイル修正
- `test`: テスト追加

---

## 📞 連絡先・リソース

### 参考リンク
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [YouTube RSS Feed](https://support.google.com/youtube/answer/6224202)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

### トラブルシューティング
**問題**: CORSエラーが発生
**解決**: プロキシが停止している可能性。Cloudflare Workersで独自プロキシ実装を推奨

**問題**: RSSが15件しか取得できない
**解決**: YouTube仕様。全件取得にはYouTube Data API必要

**問題**: デプロイ後に404エラー
**解決**: `index.html` がルートにあるか確認。Build output directoryが `/` になっているか確認

---

## ✅ 次回セッション開始時のチェックリスト

- [ ] README.md とCLAUDE.md を再確認
- [ ] `git status` で変更確認
- [ ] `git pull origin main` で最新取得
- [ ] ローカルサーバー起動して動作確認
- [ ] Cloudflare Pagesの本番サイト確認
- [ ] 既知の問題が解決されているか確認

---

## 🎯 Claude Code 用クイックスタートプロンプト

次回セッション開始時に、以下をClaude Codeに貼り付けてください：

```
YouTubeListToolプロジェクトの作業を再開します。

【プロジェクト概要】
- YouTube チャンネルから動画情報を取得するツール
- Pure HTML/CSS/JavaScript（フレームワーク不使用）
- Cloudflare Pages でデプロイ済み

【重要ルール（CLAUDE.md）】
1. 絶対に自動でgit commit/pushしないこと
2. 変更前に差分を提示すること
3. シークレット情報をハードコーディングしないこと

【現在の状態】
- 本番デプロイ済み（動作確認済み）
- Codex MCPによる大規模リファクタリング完了
- 全機能実装済み

【主要ファイル】
- index.html: UI
- app.js: ロジック（512行）
- style.css: スタイル
- HANDOVER.md: 引き継ぎドキュメント（このファイル）

【既知の課題】
- CORS Proxyへの外部依存（allorigins.win, corsproxy.io）
  → Cloudflare Workers実装を推奨

作業内容を教えてください。
```

---

## 📊 プロジェクト統計

- **開発期間**: 2025-10-25 〜 2025-10-26
- **総コミット数**: 確認してください（`git log --oneline | wc -l`）
- **総ファイル数**: 11ファイル
- **総コード行数**: 約600行（HTML/CSS/JS合計）
- **依存パッケージ**: 0（Pure JavaScript）
- **外部API**: YouTube RSS Feed（無料、APIキー不要）

---

**最終チェック日**: 2025-10-26
**チェック者**: Claude Code
**状態**: ✅ デプロイ完了、本番稼働中
