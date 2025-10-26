# CLAUDE.md — 開発アシスタント用ルール（MVP: YouTube URL list tool）

## プロジェクトの目的（短く）
指定した YouTube チャンネルから動画の URL・タイトル・公開日を取得し、URLs / Titles / Published Dates を改行区切りのコードブロックで出力する軽量ツールを作る。NotebookLM 等に貼って使える形式を目的とする。

## MVP（最小実装） — そのまま実行できる要件
- 入力：1行1件でチャンネルID（UC...）またはチャンネルURL を受け付ける。
- 設定：取得範囲（全件 or 最新 N 件）を選択可能。
- 取得方法：RSS を利用（https://www.youtube.com/feeds/videos.xml?channel_id=...）し、entry から videoId / title / published を抽出する。
- 出力：画面に以下をコードブロックで表示する。
  - `# URLs`（改行区切り、https://www.youtube.com/watch?v=VIDEO_ID）
  - `# Titles`（改行区切り）
  - `# Published Dates`（改行区切り、ISO タイムスタンプ）
- 実行：ユーザーによる手動実行（ボタン押下）。NotebookLM への自動送信は行わない。

## 受入れ基準（Acceptance Criteria）
1. 発信者を入力→取得ボタン→URLs/Titles/Published Dates の各コードブロックが表示されること。  
2. チャンネルID または チャンネルURL で正常取得できること。  
3. 取得範囲（全件／最新N件）が反映されること。

## 守るべき作業ルール（必須）
1. **絶対に自動で `git commit` や `git push` を実行しないこと。** 生成コードは必ず差分（`git diff` 相当）を提示し、人間の承認を得てからローカルで commit/push する。  
2. 変更を提案する前に、変更の目的と影響を自然言語で要約して示すこと。  
3. 秘密情報（APIキー等）をコード中に直接書かない。`.env.example` を提示し、実値はユーザーに設定させる。  
4. 生成するファイル・ファイル名を作成前に提示すること（例：`index.html` を作る／`app.js` を更新する）。  
5. テスト手順や手動確認方法（ブラウザでの確認手順）を必ず提示すること。

## 禁止事項（厳守）
- 自動で GitHub に push すること。  
- シークレットをハードコーディングすること。  
- README に書かれていない実行方法で動かすこと（事前に相談する）。

## 運用上の技術的ブロック（人が実施すること）
- リポジトリ直下に `.git/hooks/pre-push` を設置して、通常の push をブロックすること（ユーザーが明示して ALLOW_PUSH=1 等で解除できる方式を推奨）。  
- GitHub 側では main ブランチにブランチ保護ルールを設定し、直接 push を禁止する。

## 参照（実行のヒント）
- CORS によりブラウザ直接アクセスがブロックされる場合があるため、README.md に「ローカル簡易サーバ起動手順」（例：`python -m http.server 8000`）を記載すること。  
- `@handle`（@username）からチャンネルID に解決する処理は YouTube Data API（APIキー）が必要になる。MVP ではチャンネルID/チャンネルURL 優先で進めること。

## 出力例（参考）
# URLs
https://www.youtube.com/watch?v=abc123
https://www.youtube.com/watch?v=def456

# Titles
はじめてのAI活用
深掘り：モデル設計

# Published Dates
2025-10-01T12:00:00Z
2025-09-20T08:30:00Z

## 最終確認ルール（コミット前）
- 生成された差分を表示 → ユーザー承認 → ユーザーがローカルで `git add/commit` を実行 → PR を作成してレビューの上でマージ（必要に応じて）という流れを守る。

## MUST - Critical Rules
- MUST WindowsのパスはUbuntuのマウントパスに変換すること  
- 例: "C:\Users\user1\Pictures\test.jpg" → "/mnt/c/Users/user1/Pictures/test.jpg"
