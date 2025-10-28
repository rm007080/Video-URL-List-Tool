# 🔄 Video URL List Tool - 引き継ぎドキュメント

**最終更新日**: 2025-10-28
**プロジェクト状態**: 本番環境デプロイ済み（Cloudflare Pages）
**バージョン**: 1.0.0

---

## 📋 目次

1. [プロジェクト概要](#プロジェクト概要)
2. [現在の状態](#現在の状態)
3. [重要な決定事項と経緯](#重要な決定事項と経緯)
4. [技術構成](#技術構成)
5. [デプロイ環境](#デプロイ環境)
6. [重要な制約事項](#重要な制約事項)
7. [セキュリティ・コンプライアンス](#セキュリティコンプライアンス)
8. [今後の課題と将来計画](#今後の課題と将来計画)
9. [トラブルシューティング](#トラブルシューティング)
10. [参考リンク](#参考リンク)

---

## プロジェクト概要

### 目的
YouTube チャンネルに対応した動画情報取得ツール。指定したチャンネルから動画の URL・タイトル・公開日を取得し、NotebookLM 等に貼り付け可能な形式で出力する。

### ユースケース
- YouTube チャンネルの動画リストを取得してNotebookLMに貼り付け
- 複数チャンネルの最新動画を一括取得
- 個人利用・教育目的・非商用利用

### スコープ（MVP）
- ✅ チャンネルID（UC...）またはチャンネルURL入力
- ✅ 最新5〜15件の動画情報取得
- ✅ RSS経由でのデータ取得（YouTube Data API不使用）
- ✅ URLs / Titles / Published Dates のコードブロック出力
- ❌ @username形式は非対応（YouTube Data API が必要）
- ❌ 16件目以降の取得は不可（YouTube RSS の仕様）

---

## 現在の状態

### デプロイ状況
- **環境**: Cloudflare Pages（本番環境）
- **公開状態**: 一般公開済み（SNS共有可能）
- **リポジトリ**: Public
- **ビルド**: 不要（Pure HTML/CSS/JavaScript）

### 最新の変更履歴

#### 2025-10-28: アプリ名称変更
- **変更内容**: `YouTube URL List Tool` → `Video URL List Tool`
- **理由**: Googleブランディングガイドライン準拠（商標権対策）
  > アプリケーション全体の名称に「YouTube」や「YT」「You-Tube」などを組み込むことは禁止
  > 出典: https://developers.google.com/youtube/terms/branding-guidelines?hl=ja
- **影響ファイル**: index.html, README.md, CLAUDE.md, IMPLEMENTATION_PLAN.md
- **説明文の変更**: 「YouTube チャンネルに対応した」（間接的な表現は許可されている）

#### 2025-10-28: プライバシーポリシー追加
- **追加場所**: README.md (利用規約と注意事項 > プライバシーに関する重要な情報)
- **追加場所**: index.html (黄色の警告ボックス)
- **主な内容**:
  - 送信される情報: チャンネルID、IPアドレス、アクセス時刻、ブラウザ情報
  - 送信先: allorigins.win, corsproxy.io, YouTube RSS
  - 本アプリ自体はデータを保存しないことを明記
  - ボタンクリック = 同意とみなす旨を明記

#### 2025-10-28: CORS Proxy の制限情報を明記
- **追加場所**: README.md (制限事項 > CORS Proxy の制限)
- **主な内容**:
  - allorigins.win: MIT ライセンス、利用規約・レート制限は不明
  - corsproxy.io: 開発用途は無料、「production site」の定義は曖昧
  - 本ツールは非商用の個人プロジェクトとして運用中

#### 2025-10-28: 利用規約と免責事項追加
- **追加場所**: README.md (利用規約と注意事項)
- **主な内容**:
  - 個人利用・教育目的限定
  - 商用利用禁止
  - YouTube利用規約への準拠を要求
  - 免責事項（無保証、サービス停止リスク、損害責任の免責）

### 主要ファイル
```
.
├── index.html              # メインUIページ
├── style.css               # スタイリング
├── app.js                  # コアロジック（511行）
├── README.md               # ユーザー向けドキュメント
├── CLAUDE.md               # 開発ルール（AI用）
├── IMPLEMENTATION_PLAN.md  # 実装計画
├── HANDOVER.md             # このファイル（引き継ぎドキュメント）
└── LICENSE                 # MIT License
```

---

## 重要な決定事項と経緯

### 1. 名称変更：YouTube → Video

**決定**: アプリ名に「YouTube」を含めない

**理由**:
- Googleブランディングガイドライン違反のリスク
- 商標権侵害の可能性

**根拠**:
> アプリケーション全体の名称に「YouTube」や「YT」「You-Tube」などを組み込むことは禁止
> ただし、「YouTube に最適なアプリ」などの類似した表現を使用して、アプリが YouTube 向けであることや YouTube と連携することを言及することは可能

**対応**:
- アプリ名: `Video URL List Tool`
- 説明文: 「YouTube チャンネルに対応した」（間接的な表現）
- 技術的な説明（「YouTube RSS」「YouTube Data API」など）は変更不要

### 2. YouTube Data API 不使用

**決定**: YouTube RSS フィードを使用、YouTube Data API は使用しない（現時点）

**理由**:
- **APIキー不要**: バックエンドサーバーが不要
- **シンプル**: Pure HTML/CSS/JavaScript のみで動作
- **コスト**: 完全無料（APIクォータの心配なし）
- **デプロイ**: 静的サイトとしてCloudflare Pagesで公開可能
- **制約の受容**: 最新15件までという制限は許容範囲

**トレードオフ**:
- ❌ @username 形式の入力に対応できない
- ❌ 16件以上の動画を取得できない
- ❌ 動画の詳細情報（再生回数、いいね数など）を取得できない

**将来的な課題**:
- @username 形式に対応するには YouTube Data API が必要
- その場合はバックエンド（Cloudflare Workers等）の構築が必須
- 詳細は「YouTube Data API 導入計画」を参照

### 3. CORS Proxy の選択

**決定**: allorigins.win（プライマリ）+ corsproxy.io（フォールバック）

**理由**:
- ブラウザから直接YouTube RSSを取得できない（CORS制限）
- 第三者のCORS Proxyサービスを利用
- フォールバック構成で信頼性を向上

**懸念事項と対応**:
1. **corsproxy.io の利用規約**:
   - 「production site」で有料プランが必要と記載
   - 個人の非商用プロジェクトが該当するかは不明確
   - **対応**: README.mdに現状を明記、非商用として運用中

2. **プライバシーリスク**:
   - ユーザーのIPアドレスがCORS Proxyサーバーに送信される
   - **対応**: プライバシーポリシーで明示的に開示

3. **サービス停止リスク**:
   - 第三者サービスのため、予告なく停止する可能性
   - **対応**: フォールバック構成、免責事項で明記

**残したまま**:
- corsproxy.io をフォールバックとして維持
- allorigins.win停止時のバックアップとして機能

### 4. プライバシーポリシーの追加

**決定**: 第三者への情報送信を明示的に開示

**理由**:
- CORS Proxy 経由でIPアドレスが第三者に送信される
- ユーザーが意識していない情報が収集される
- 個人情報保護法の観点でリスク回避
- SNS公開前にトラブル防止

**記載内容**:
- **送信される情報**: チャンネルID、IPアドレス、アクセス時刻、ブラウザ情報
- **送信先**: allorigins.win, corsproxy.io, YouTube RSS
- **本アプリのデータ管理**: データを保存しない、ログを記録しない、Cookieを使用しない
- **利用者の同意**: ボタンクリック = 同意とみなす

**実装箇所**:
- README.md: 詳細なプライバシーポリシー
- index.html: 黄色の警告ボックス（目立つ表示）

### 5. GitHubリポジトリをPublicのまま維持

**決定**: リポジトリは Public

**理由**:
- APIキーや秘密情報を使用していない（現時点）
- すべてクライアントサイドで動作
- オープンソースとして公開可能
- Private化しても security benefit がない

**重要な注意点**:
> Privateリポジトリでも安全ではない
> - Git履歴に永久保存される
> - アカウント侵害で流出リスク
> - 誤って公開される可能性
> - CI/CDツールやログに露出

**将来的な注意点**:
- YouTube Data API を使用する場合でも、環境変数で管理すれば Public のまま可能
- `.env` を `.gitignore` に追加することが必須
- APIキーは絶対にコードに書かない

---

## 技術構成

### フロントエンド
- **Pure HTML/CSS/JavaScript**
- フレームワーク不使用
- ビルドツール不要
- モダンブラウザ対応（Chrome, Firefox, Edge, Safari）

### 主要APIとライブラリ
- **DOMParser API**: XML パース
- **Fetch API**: HTTP リクエスト
- **AbortController**: タイムアウト制御
- ライブラリ依存なし

### 外部サービス依存

#### 1. allorigins.win (CORS Proxy - プライマリ)
- **ライセンス**: MIT
- **利用規約**: 不明
- **レート制限**: 不明
- **GitHub**: https://github.com/gnuns/allorigins
- **用途**: YouTube RSS へのCORS制限回避

#### 2. corsproxy.io (CORS Proxy - フォールバック)
- **利用規約**: 開発用途は無料、「production site」は有料（曖昧）
- **公式サイト**: https://corsproxy.io/
- **用途**: allorigins.win 停止時のフォールバック

#### 3. YouTube RSS
- **URL**: https://www.youtube.com/feeds/videos.xml?channel_id=...
- **認証**: 不要
- **制限**: 最新15件まで

### パフォーマンス最適化
- **同時実行制限**: 3チャンネルまで（`CONCURRENCY_LIMIT`）
- **タイムアウト**: 10秒（各CORS Proxy）
- **Promise Pool**: 順序保証しながら並列実行
- **DOM操作最適化**: 配列を1回だけ走査（reduce使用）

### セキュリティ対策
- **XSS対策**: `textContent` のみ使用（`innerHTML` 禁止）
- **入力検証**: 正規表現でチャンネルID形式をチェック
- **チャンネルID検証**: RSSのyt:channelIdと入力を照合
- **URL検証**: 生成されたURLがYouTubeドメインか確認
- **タイムアウト**: 長時間リクエストの防止

---

## デプロイ環境

### Cloudflare Pages
- **デプロイ方法**: Git連携（main ブランチへのpushで自動デプロイ）
- **ビルドコマンド**: なし
- **出力ディレクトリ**: `/`（ルート）
- **プレビュー**: feature/* ブランチで自動的にプレビューURLが生成される

### デプロイフロー
```
1. ローカルで開発・テスト
2. git add/commit（手動、CLAUDE.mdのルールに従う）
3. git push origin main
4. Cloudflare Pages が自動検知
5. 本番環境に自動デプロイ（数分以内）
```

### ブランチ戦略
- **main**: 本番環境（Cloudflare Pagesと連携）
- **feature/***: 開発用ブランチ（Cloudflare Preview Deploysで確認可能）

### 環境変数
**現在**: 使用していない

**将来（YouTube Data API 使用時）**:
- `YOUTUBE_API_KEY`: YouTube Data API キー（Cloudflare Workers環境変数で管理）
- `APP_SECRET`: 認証用シークレット
- `FIREBASE_PROJECT_ID`: Firebase認証用（オプション）

---

## 重要な制約事項

### YouTube RSS の制約
1. **最新15件まで**: YouTube RSS フィードは最新15件までしか提供しない
2. **ページネーション不可**: 16件目以降の動画は取得できない
3. **更新遅延**: RSS の更新には数分〜数時間の遅延がある
4. **非対応形式**:
   - `@username` (ハンドル形式) → YouTube Data API が必要
   - `/c/channelname` (カスタムURL) → 廃止された形式

### CORS Proxy の制約
1. **第三者サービス依存**: 自前のインフラではない
2. **レート制限**: allorigins.win の制限は不明、corsproxy.io は要確認
3. **サービス停止リスク**: プロバイダーの都合で停止する可能性
4. **プライバシー**: ユーザーのIPアドレスがProxyサーバーに記録される可能性

### アプリケーションの制約
1. **並列取得制限**: 同時3チャンネルまで（レート制限回避のため）
2. **タイムアウト**: 各リクエスト10秒
3. **ブラウザ依存**: モダンブラウザ必須（IE非対応）

---

## セキュリティ・コンプライアンス

### 実装済みのセキュリティ対策

| 対策 | 実装内容 | コード箇所 |
|------|---------|-----------|
| XSS対策 | `textContent`のみ使用 | app.js:315, 336 |
| 入力検証 | 正規表現でチャンネルID検証 | app.js:8-9, 125 |
| チャンネルID検証 | RSS応答のyt:channelIdと照合 | app.js:236-238 |
| URL検証 | 生成URLがYouTubeドメインか確認 | app.js:249-251 |
| タイムアウト | AbortControllerで10秒制限 | app.js:74-88 |
| エラーハンドリング | 全エラーをキャッチして表示 | app.js:256-258, 498-500 |

### コンプライアンス対応

#### Googleブランディングガイドライン
- ✅ アプリ名に「YouTube」を含まない
- ✅ 説明文で間接的に言及（「YouTube チャンネルに対応した」）
- ✅ 技術的な説明は維持（「YouTube RSS」など）

#### プライバシー保護
- ✅ 第三者への情報送信を明記（README.md, index.html）
- ✅ IPアドレス送信を明示
- ✅ 利用者の同意を取得（ボタンクリック = 同意）
- ✅ 本アプリ自体はデータを保存しないことを明記

#### 利用規約
- ✅ 個人利用・教育目的限定
- ✅ 商用利用禁止
- ✅ YouTube利用規約への準拠を要求
- ✅ 免責事項（無保証、サービス停止リスク、損害責任の免責）

### 未対応（将来的に必要になる可能性）
- ❌ GDPR対応（EU圏ユーザー向け）
- ❌ Cookie同意バナー（現状Cookieを使用していないため不要）
- ❌ データ削除リクエストの仕組み（現状データを保存していないため不要）

---

## 今後の課題と将来計画

### 短期的な改善（優先度: 中）

1. **エラーメッセージの改善**
   - 現状: 技術的なエラーメッセージ
   - 改善: ユーザーフレンドリーな説明

2. **ローディングUI の改善**
   - 現状: シンプルなスピナー
   - 改善: 進捗状況の表示（「3/5 チャンネル取得中」など）

3. **結果のエクスポート機能**
   - CSVダウンロード
   - JSONダウンロード

### 中期的な機能追加（優先度: 低〜中）

1. **@username 形式への対応**
   - **要件**: YouTube Data API の導入が必須
   - **影響**: バックエンド（Cloudflare Workers等）の構築が必要
   - **詳細**: 下記「YouTube Data API 導入計画」を参照

2. **日付範囲フィルター**
   - 「2024年1月以降の動画のみ」などの絞り込み

3. **ダークモード**
   - CSS変数を使用したテーマ切り替え

### 長期的な検討（優先度: 低）

1. **自前CORS Proxyの構築**
   - Cloudflare Workers で実装
   - 第三者サービスへの依存を排除
   - プライバシーリスクの低減

2. **PWA化**
   - オフライン対応
   - Service Worker の導入

---

## YouTube Data API 導入計画（将来）

**注意**: この計画は将来的な実装のためのメモです。現時点では実装していません。

### 必要になるケース
- @username 形式のチャンネル入力に対応したい場合
- 16件以上の動画を取得したい場合
- 動画の詳細情報（再生回数、いいね数など）を取得したい場合

### 実装要件

#### 1. ポリシー順守（必須）

YouTube Data APIを使用する場合、以下のポリシー準拠が**必須**です：

**必須リンクの追加**:
```html
<footer class="legal-links">
  <a href="privacy-policy.html">プライバシーポリシー</a> |
  <a href="terms.html">利用規約</a> |
  <a href="https://www.youtube.com/t/terms" target="_blank">YouTube 利用規約</a> |
  <a href="https://policies.google.com/privacy" target="_blank">Google プライバシーポリシー</a>
</footer>
```

**プライバシーポリシーに必須の記載**:
- YouTube API サービスの使用を通知
- Googleプライバシーポリシーへのリンク
- データアクセス取り消し方法: https://security.google.com/settings/security/permissions
- データ削除リクエストの方法（30日以内に削除）
- ユーザーデータの収集・使用・保存方法
- 第三者への共有方法

**初回使用時の同意モーダル（必須）**:
- ユーザーがアプリの機能にアクセスする前に同意を求める
- YouTube利用規約とGoogleプライバシーポリシーへのリンク
- データアクセスの取り消し方法を説明

**参考リンク**:
- https://developers.google.com/youtube/terms/developer-policies?hl=ja
- https://developers.google.com/youtube/terms/developer-policies-guide?hl=ja

#### 2. バックエンドの構築（必須）

**理由**:
> クラウド上の Git リポジトリに API キーが含まれることは大きなセキュリティリスク
> リポジトリがプライベートであるかどうかと、API キーを利用することと、イコールにはなりません

**リスク**:
- Git履歴に永久保存される
- アカウント侵害で流出
- 誤って公開される可能性
- CI/CDツールやログに露出

**推奨構成**: Cloudflare Workers

```
[フロントエンド (Cloudflare Pages)]
    ↓ HTTPS リクエスト
[バックエンド (Cloudflare Workers)] ← 環境変数でAPIキー管理
    ↓ YouTube Data API
[YouTube]
```

**実装例**:
```javascript
// workers/youtube-api.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const handle = url.searchParams.get('handle'); // @username

    // 環境変数からAPIキー取得
    const API_KEY = env.YOUTUBE_API_KEY;

    // YouTube Data API 呼び出し
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${handle}&type=channel&key=${API_KEY}`
    );

    const data = await response.json();
    const channelId = data.items[0]?.id?.channelId;

    return new Response(JSON.stringify({ channelId }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://your-app.pages.dev'
      }
    });
  }
};
```

**環境変数設定**:
```bash
# Cloudflare Workers Secrets（Git にコミットしない）
wrangler secret put YOUTUBE_API_KEY
```

**`.gitignore` に追加**:
```gitignore
# 環境変数（APIキーを含む）
.env
.env.local
.env.production
.dev.vars
```

#### 3. 認証・認可の実装（推奨）

**理由**:
> サービス提供者側が用意する第三者サービスの API キーを使用するのであれば、アプリの認証や認可が必要か？、というのは検討した方が良い

**問題**: 認証なしだと、誰でもあなたのAPIを無制限に使える
- 悪意のあるユーザーがクォータを使い果たす
- 課金が発生する可能性

**推奨方法**:
- Firebase Authentication + トークン検証
- レート制限（Cloudflare KV 使用）

**実装例**:
```javascript
export default {
  async fetch(request, env) {
    // 1. 認証トークン検証
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.substring(7);

    if (!await verifyToken(token)) {
      return new Response('Unauthorized', { status: 401 });
    }

    // 2. レート制限チェック
    const userId = extractUserId(token);
    const limitKey = `limit:${userId}`;
    const count = await env.KV.get(limitKey);

    if (count && parseInt(count) > 100) {
      return new Response('Rate limit exceeded', { status: 429 });
    }

    // 3. YouTube API 呼び出し
    // ...
  }
};
```

#### 4. ユーザーのAPIキーを保存する場合の注意（別案）

> 第三者サービスの API キーをアプリ利用者が用意する場合は、その情報を localstorage や Indexddb など利用者のセキュリティリスクになり得る場所には保存しない

**問題**: localStorageやIndexedDBに平文で保存すると、XSS攻撃で盗まれる

**推奨方法**:
1. **セッションのみで保持**（最も安全）
   ```javascript
   let apiKey = null; // メモリ内に保存
   // ページを閉じれば消える
   ```

2. **sessionStorage を使う**（中間案）
   ```javascript
   sessionStorage.setItem('key', apiKey);
   // タブを閉じれば消える
   ```

3. **Web Crypto API で暗号化**（高度）
   ```javascript
   // ユーザーのパスワードで暗号化してlocalStorageに保存
   await crypto.subtle.encrypt(...)
   ```

**結論**: ユーザーのAPIキー方式は避け、開発者が管理したAPIキーをバックエンドで使う方が安全

---

## トラブルシューティング

### よくある問題と解決方法

#### 1. 全てのCORS Proxyが利用できません

**原因**:
- CORS Proxyサービスがダウンしている
- レート制限に達している

**解決方法**:
1. 時間をおいて再試行（15分〜1時間後）
2. 入力チャンネル数を減らす

**長期的対策**:
- 自前のCORS Proxyを構築（Cloudflare Workers）

#### 2. @username 形式は非対応です

**原因**:
- ハンドル形式はYouTube Data APIが必要

**解決方法**:
1. YouTubeでチャンネルページを開く
2. ページのソースを表示（Ctrl+U）
3. `"channelId":"UC..."` を検索
4. 見つかったチャンネルID（UC...）を使用

#### 3. 取得失敗: Invalid XML format

**原因**:
- チャンネルが存在しない
- チャンネルIDが間違っている

**解決方法**:
1. チャンネルIDが正しいか確認（UC + 22文字）
2. ブラウザで直接RSS URLにアクセス:
   `https://www.youtube.com/feeds/videos.xml?channel_id=UC...`

---

## 参考リンク

### 公式ドキュメント
- [YouTube RSS Feeds](https://support.google.com/youtube/answer/6224202)
- [YouTube ブランディングガイドライン](https://developers.google.com/youtube/terms/branding-guidelines?hl=ja)
- [YouTube デベロッパーポリシー](https://developers.google.com/youtube/terms/developer-policies?hl=ja)
- [YouTube Data API](https://developers.google.com/youtube/v3)
- [Googleプライバシーポリシー](https://policies.google.com/privacy)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages](https://developers.cloudflare.com/pages/)

### 使用サービス
- [allorigins.win](https://allorigins.win/) - CORS Proxy
- [allorigins.win GitHub](https://github.com/gnuns/allorigins)
- [corsproxy.io](https://corsproxy.io/) - CORS Proxy

### セキュリティ
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)

---

## 開発ルール（重要）

このプロジェクトは `CLAUDE.md` に記載された開発ルールに従っています。
新しい開発者またはAIアシスタントは、コード変更前に必ず `CLAUDE.md` を確認してください。

**特に重要なルール**:

1. **絶対に自動で `git commit` や `git push` を実行しないこと**
   - 変更は必ず差分を提示してユーザーの承認を得る
   - ユーザーがローカルで手動実行

2. **変更の目的と影響を事前に説明すること**
   - 何を変更するか
   - なぜ変更するか
   - どのファイルに影響するか

3. **シークレット情報をコードに書かないこと**
   - `.env.example` を提示
   - 実値はユーザーに設定させる

4. **テスト手順を必ず提示すること**
   - ブラウザでの確認方法
   - 期待される動作

---

## 連絡先・サポート

**プロジェクトオーナー**: （あなたの情報を記載）
**GitHub Issues**: （リポジトリURL/issues）
**Email**: （メールアドレス）

---

**最終更新**: 2025-10-28
**バージョン**: 1.0.0
**ステータス**: 本番環境稼働中
