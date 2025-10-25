# YouTubeListTool

YouTube チャンネルから動画の **URL・タイトル・公開日** を取得し、NotebookLM 等にコピー&ペーストしやすい形式で出力する軽量ツールです。

## 特徴

- チャンネルID または チャンネルURL を入力するだけで動画情報を取得
- 複数チャンネルの一括取得に対応
- 全件取得 または 最新N件のみ取得が選択可能
- コードブロック形式で出力（NotebookLM に最適）
- ブラウザだけで動作（API キー不要）

## 使い方

### 1. ローカルサーバーの起動

CORS（クロスオリジン制限）対策のため、ローカルサーバーで起動してください。

**Python を使う場合:**
```bash
python -m http.server 8000
```

**Node.js (npx) を使う場合:**
```bash
npx http-server -p 8000
```

**その他の方法:**
- VS Code の Live Server 拡張機能
- PHP: `php -S localhost:8000`

### 2. ブラウザでアクセス

```
http://localhost:8000
```

### 3. チャンネル情報を入力

以下のいずれかの形式で入力（1行1件、複数可）：

- **チャンネルID**: `UCxxxxxxxxxxxxxxxxxxxxxxxx`
- **チャンネルURL**: `https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxxxx`

例:
```
UCqm-hTLLmPbB2e7z6sG3Zrg
https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw
```

### 4. 取得設定

- **全件取得**: RSS フィードに含まれる全動画を取得
- **最新 N 件のみ**: 指定した件数のみ取得（デフォルト: 15件）

### 5. 結果をコピー

各セクションの「コピー」ボタンをクリックして、NotebookLM 等に貼り付け

## 出力形式

```
# URLs
https://www.youtube.com/watch?v=abc123
https://www.youtube.com/watch?v=def456

# Titles
はじめてのAI活用
深掘り：モデル設計

# Published Dates
2025-10-01T12:00:00Z
2025-09-20T08:30:00Z
```

## 技術仕様

- **RSS フィード**: YouTube の公式 RSS (`https://www.youtube.com/feeds/videos.xml?channel_id=...`)
- **CORS 対策**: corsproxy.io を使用（本番環境では独自プロキシ推奨）
- **API キー**: 不要（RSS のみ使用）
- **動作環境**: モダンブラウザ（Chrome, Firefox, Edge, Safari）

## 注意事項

- RSS フィードは通常、最新 15 件程度しか含まれません（YouTube の仕様）
- `@handle` 形式のチャンネル指定は未対応（チャンネルID/URL を使用してください）
- チャンネルID は `UC` で始まる 24 文字の文字列です

## チャンネルID の確認方法

1. YouTube のチャンネルページにアクセス
2. URL を確認:
   - `https://www.youtube.com/channel/UCxxxxxxxx` → `UCxxxxxxxx` がチャンネルID
   - `https://www.youtube.com/@username` → ページソースから `channelId` を検索

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照

## 開発者向け

開発のルールと要件については [CLAUDE.md](CLAUDE.md) を参照してください。
