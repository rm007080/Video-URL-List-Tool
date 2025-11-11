# Video URL List Tool - デプロイ前チェックリスト & スモークテスト

**プロジェクト情報**
- 本番URL: https://youtubelisttool.pages.dev
- Workers URL: https://youtube-list-tool-proxy.littlelit-3.workers.dev
- リポジトリ: rm007080/Video-URL-List-Tool (main)
- 所要時間目安: デプロイ前チェック 20–30分 / スモークテスト 30–45分

---

## 📋 デプロイ前チェックリスト

### 1. バージョン管理の最新化 ⏱️ 1分
- [ ] 版管理の最新化（main最新/未コミットなし）
  - **コマンド**: `git fetch origin && git status && git rev-parse --abbrev-ref HEAD`
  - **期待**: ブランチが`main`で差分なし
  - **エラー時**: `git pull --rebase origin main`で同期

### 2. 構文エラー・デバッグ削除 ⏱️ 3–5分
- [ ] 構文エラー・デバッグ削除
  - **確認**: `app.js`/`workers`内の`console.log`, `TODO`, `debugger`は必要最小限
  - **コマンド**: `rg -n "(console\.log|debugger|TODO)" --glob '!node_modules'`
  - **期待**: 不要な出力がない
  - **エラー時**: ログ/デバッグ出力を削除または`DEBUG`フラグで制御

### 3. Workers URL/環境向けスイッチ確認 ⏱️ 2分
- [ ] Workers URL/環境向けスイッチ確認
  - **確認**: フロントのベースURLが本番向けに`https://youtube-list-tool-proxy.littlelit-3.workers.dev`を参照
  - **コマンド**: `rg -n "workers\.dev|WORKER_URL|BASE_URL" . --glob '!node_modules' --glob '!.git'`
  - **期待**: 本番ビルド/Pagesで正しいURLを参照
  - **エラー時**: `.env`や`config.*`で環境別設定を見直し

### 4. 環境変数・Secrets（Workers） ⏱️ 5分
- [ ] 環境変数・Secrets確認
  - **必須**: `YOUTUBE_API_KEY`（YouTube Data API v3）
  - **コマンド**:
    ```bash
    npx wrangler whoami
    npx wrangler secret list
    # なければ: npx wrangler secret put YOUTUBE_API_KEY
    ```
  - **期待**: 本番環境に鍵が存在/参照される
  - **エラー時**: Google Cloud ConsoleでAPIキーを発行し再登録

### 5. APIキー制限/クォータ確認 ⏱️ 3分
- [ ] APIキー制限/クォータ確認
  - **推奨**: Workersで使用するキーは「アプリケーション制限なし」またはServer用途に限定。HTTPリファラ制限はWorkersでは不適合
  - **期待**: クォータが十分（10,000/日）で「無効化/制限過多」になっていない
  - **エラー時**: 一時的に制限を緩和 or 別プロジェクトのキーに切替

### 6. CORS設定（Workers） ⏱️ 3分
- [ ] CORS設定確認
  - **許可Origin**: `https://youtubelisttool.pages.dev`（必要なら`https://*.pages.dev`も）
  - **cURL確認**:
    ```bash
    curl -i -X OPTIONS "https://youtube-list-tool-proxy.littlelit-3.workers.dev/fetch-videos" \
      -H "Origin: https://youtubelisttool.pages.dev" \
      -H "Access-Control-Request-Method: POST"
    ```
  - **期待**: `HTTP/1.1 204` か 200台 + `Access-Control-Allow-Origin: https://youtubelisttool.pages.dev`
  - **エラー時**: WorkersのCORSヘッダ（preflight/本体レスポンス両方）を修正

### 7. キャッシュ・キャッシュバスティング（Pages） ⏱️ 3分
- [ ] キャッシュ・キャッシュバスティング確認
  - **確認**: 静的ファイルはハッシュ付き or `?v=ビルドID`付与（例: `<script src="/app.js?v=20251111">`）
  - **HTTP確認**: `curl -sI https://youtubelisttool.pages.dev | rg -i "etag|cache-control"`
  - **期待**: 新ビルドで古いJS/CSSが残らない
  - **エラー時**: PagesのPurge、バージョンクエリ付与、`_headers`で適切なキャッシュ制御

### 8. CSP/セキュリティヘッダ（Pages `_headers`） ⏱️ 5分
- [ ] CSP/セキュリティヘッダ確認
  - **推奨CSP例**（必要に応じ調整）:
    ```
    default-src 'self';
    img-src 'self' https: data:;
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    connect-src 'self' https://youtube-list-tool-proxy.littlelit-3.workers.dev;
    frame-src https://www.youtube.com https://youtube.com;
    ```
  - **期待**: 主要機能が動作しつつ、不要な外部読み込みを抑制
  - **エラー時**: ブロック要素をConsoleで確認し、最小限ホワイトリスト追記

### 9. Durable Objects バインディング/マイグレーション ⏱️ 3分
- [ ] Durable Objects バインディング確認
  - **確認**: `wrangler.toml`のDO設定（name/class）と本番バインディングが一致
  - **コマンド**: `rg -n "durable_objects|class_name|bindings" wrangler.toml`
  - **期待**: 本番でDOが作成/参照される
  - **エラー時**: `wrangler deploy`時のマイグレーションエラーを修正

### 10. 本番前の軽いログ確認（Workers） ⏱️ 2分
- [ ] Workers ログ確認
  - **コマンド**: `npx wrangler tail --format=pretty`
  - **期待**: エラーが継続的に出ていない
  - **エラー時**: 該当リクエスト/入力を再現し修正

### 11. ブラウザキャッシュクリア手順 ⏱️ 2分
- [ ] ブラウザキャッシュクリア準備
  - **Chrome**: DevToolsを開く → リロードボタン長押し → Empty Cache and Hard Reload
  - **Safari**: Safariメニュー → 設定 → 詳細 → メニューバーに「開発」表示 → 開発 → キャッシュを空にする
  - **Firefox**: Ctrl/Cmd+Shift+Rでハードリロード or 設定 → プライバシーとセキュリティ → Cookieとサイトデータ → データを削除
  - **期待**: 新ビルド反映を確実化
  - **エラー時**: サイトデータ削除後、再アクセス

---

## 🧪 簡易スモークテスト

### 事前準備 ⏱️ 2分
- [ ] APIクォータ残量をメモ（YouTube Console）
- [ ] テスト用チャンネル: `@GoogleDevelopers`（channelId: UC_x5XG1OV2P6uZZ5FSM9Ttw）
- [ ] ブラウザ: Chrome/Safari/Firefoxを準備（シークレット/プライベート推奨）

---

### エンドポイント cURL テスト（Workers） ⏱️ 10–15分

#### 1. ルート `/`（CORSプロキシの正常応答）
- [ ] ステータス/ヘッダ確認
  - **コマンド**:
    ```bash
    curl -i "https://youtube-list-tool-proxy.littlelit-3.workers.dev/" \
      -H "Origin: https://youtubelisttool.pages.dev"
    ```
  - **期待**:
    - 200台のステータス
    - `Access-Control-Allow-Origin: https://youtubelisttool.pages.dev`
  - **エラー時**: CORSヘッダ実装/オリジン判定を見直し

#### 2. `/resolve-channel`（@username解決）
- [ ] 正常系（存在するハンドル）
  - **コマンド**:
    ```bash
    curl -s "https://youtube-list-tool-proxy.littlelit-3.workers.dev/resolve-channel?username=GoogleDevelopers" \
      -H "Origin: https://youtubelisttool.pages.dev"
    ```
  - **期待**（JSON例）:
    ```json
    {"channelId":"UC_x5XG1OV2P6uZZ5FSM9Ttw","title":"Google for Developers"}
    ```
  - **エラー時**:
    - 404/400ならハンドルのバリデーション/YouTube APIレスポンス処理を確認
    - 429なら時間をあける/段階的ロード間隔を調整

- [ ] 異常系（存在しないハンドル）
  - **コマンド**:
    ```bash
    curl -i "https://youtube-list-tool-proxy.littlelit-3.workers.dev/resolve-channel?username=this_handle_does_not_exist" \
      -H "Origin: https://youtubelisttool.pages.dev"
    ```
  - **期待**: 404/400 + エラーメッセージJSON（ユーザ向け文言）
  - **エラー時**: エラー時のHTTPコード/エラーフォーマットを統一

#### 3. `/fetch-videos`（API取得・段階的ロード）
- [ ] GETクエリ版
  - **コマンド**:
    ```bash
    curl -s "https://youtube-list-tool-proxy.littlelit-3.workers.dev/fetch-videos?channelId=UC_x5XG1OV2P6uZZ5FSM9Ttw&limit=50" \
      -H "Origin: https://youtubelisttool.pages.dev"
    ```
  - **期待**（JSON例）:
    - `videos`が配列で取得（0–50件）
    - 50件未満で`nextPageToken`がある場合、さらに取得可能
    - CORSヘッダ付与
  - **エラー時**:
    - 400: 入力パラメータ不足/無効 → バリデーション/エラーメッセージ改善
    - 403: APIキー権限/クォータ超過 → キー/クォータ確認
    - 429: レート制限 → リトライ間隔/バッチ分割/DOの調整
    - 5xx: 一時障害 → リトライ実装/ログで原因特定

- [ ] CORSプリフライト確認
  - **コマンド**:
    ```bash
    curl -i -X OPTIONS "https://youtube-list-tool-proxy.littlelit-3.workers.dev/fetch-videos" \
      -H "Origin: https://youtubelisttool.pages.dev" \
      -H "Access-Control-Request-Method: GET"
    ```
  - **期待**: 204/200 + `Access-Control-Allow-Origin` と `Access-Control-Allow-Methods: GET`

---

### ブラウザ操作テスト（Pages + Workers） ⏱️ 20–30分

#### A. 初期表示
- [ ] ページロード（Chrome）: `https://youtubelisttool.pages.dev`
  - **期待**: エラーなし表示、主要UI（モード選択、入力、ボタン、プログレスバー）
  - **エラー時**: DevTools Console/Networkで失敗リクエストとCSPブロック確認

#### B. @username解決（UI）
- [ ] `@GoogleDevelopers`を入力 → 解決ボタン
  - **期待**: `UC_x5XG1OV2P6uZZ5FSM9Ttw`に解決/表示（内部的に`/resolve-channel`成功）
  - **エラー時**: 無効ハンドルで適切なユーザ向けエラー

#### C. RSSモード（≤ 15件）
- [ ] モードをRSS、件数を15に設定 → 取得
  - **期待**: クォータ消費なしで最大15件、素早く結果表示
  - **追加確認**: 日付範囲フィルターを狭めても結果が整合
  - **エラー時**: RSSパース失敗時のメッセージと再試行導線

#### D. APIモード（50件・段階的ロード）
- [ ] モードをAPI、件数50 → 取得
  - **期待**:
    - プログレスバーが段階的に進行
    - `さらに読み込み`ボタンで続きが取得
    - `キャンセル`で即時中断/UIが安全に戻る
  - **エラー時**: 途中失敗時に再実行できる/ユーザ向けの明確な案内

#### E. エラーハンドリング
- [ ] 無効ID/ハンドルで取得試行
  - **期待**: 400/404相当のユーザ向けエラー表示、スタックトレース非表示
- [ ] ネットワークオフラインにして試行（Chrome: Airplaneモード/DevToolsのOffline）
  - **期待**: オフライン専用の案内（再接続で復帰可能）
- [ ] 429相当（短時間で連打）
  - **期待**: 「しばらくしてから」「間隔を空けて」等のリトライ案内

#### F. エクスポート（CSV/JSON/テキスト）
- [ ] いずれかの結果からCSV/JSON/TXTをダウンロード
  - **期待**:
    - ファイル名に日時/チャンネル識別子（例: `videos_YYYYMMDD_HHMM.csv`）
    - CSV: ヘッダー付き、文字化けなし
    - JSON: 整形/UTF-8
    - TXT: URLの1行1件
  - **エラー時**:
    - 文字コード/改行コード確認（特にWindows環境）
    - 0件時の空ファイルハンドリング

#### G. 複数ブラウザ確認
- [ ] SafariでA–Fを要点確認（CSP差異に注意）
- [ ] FirefoxでA–Fを要点確認（ダウンロード挙動に注意）
  - **期待**: 主要機能同等に動作
  - **エラー時**: ブラウザ固有差異（ポップアップ/ダウンロード/キャッシュ）を回避

#### H. 目視の最終確認
- [ ] UIテキスト/表記揺れ/タイポ
- [ ] ローディング中の操作抑制（多重実行防止）
- [ ] スクロール/レスポンシブ（スマホ幅で崩れなし）

---

## ⚠️ よくあるエラーと対処

| エラー | 原因 | 対処方法 |
|--------|------|---------|
| **403（YouTube API）** | APIキー無効/制限 | GCPで有効化と制限見直し、`YOUTUBE_API_KEY`再設定 |
| **429（レート制限）** | 短時間の集中アクセス | 段階的ロード間隔/リトライバックオフ、時間を空ける |
| **CORS失敗** | `Access-Control-Allow-Origin`不足/Origin不一致 | Workersの許可リストに本番Originを追加 |
| **CSPブロック** | `connect-src`等が不足 | 必要最小限でWorkers/YouTube関連ドメインを許可 |
| **古いJS/CSSが読まれる** | キャッシュ | クエリ版数付与/PagesでPurge/ブラウザ硬リロード |

---

## 📝 記録テンプレート（任意）

- **デプロイ日時**: [ ]
- **Gitコミット/タグ**: [ ]
- **実行ブラウザ/OS**: [ ]
- **cURLテスト結果**: [OK/NG] 備考: [ ]
- **ブラウザテスト結果（RSS/API/Export）**: [OK/NG] 備考: [ ]
- **既知の軽微事項（非ブロッカー）**: [ ]
- **リリース可否**: [GO / HOLD]

---

**作成日**: 2025-11-11
**作成者**: Codex MCP (Claude Sonnet 4.5)
