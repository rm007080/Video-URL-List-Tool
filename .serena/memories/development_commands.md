# 開発コマンド

## ローカルサーバー起動

### Python 3.x の場合（推奨）
```bash
python -m http.server 8000
```

### Python 2.x の場合
```bash
python -m SimpleHTTPServer 8000
```

### Node.js（http-server）の場合
```bash
npx http-server -p 8000
```

### ブラウザでアクセス
```
http://localhost:8000/index.html
```

## Git コマンド

### 現在の状態確認
```bash
git status
git diff
```

### ブランチ確認
```bash
git branch
```

### 最新の変更を取得
```bash
git pull origin main
```

### コミット（手動のみ）
```bash
git add <files>
git commit -m "commit message"
```

**重要**: 自動での `git commit` や `git push` は禁止されています（CLAUDE.md 参照）

## ファイル操作

### ディレクトリ内容確認
```bash
ls -la
```

### ファイル検索
```bash
find . -name "*.js"
```

### コンテンツ検索
```bash
grep -r "search_term" .
```

## デプロイ

### Cloudflare Pages
- `main` ブランチへのpushで自動デプロイ
- デプロイ時間: 約30秒〜1分
- ビルドログ: Cloudflare Pagesダッシュボードで確認可能

## テスト・リント・フォーマット

**注意**: このプロジェクトはPure JavaScriptのため、以下のコマンドはありません：
- テストコマンド: なし
- リントコマンド: なし
- フォーマットコマンド: なし

### 手動テスト手順
1. ローカルサーバー起動
2. 有効なチャンネルIDを入力（例: `UCqm-hTLLmPbB2e7z6sG3Zrg`）
3. 「取得」ボタンクリック
4. URLs/Titles/Datesが表示されることを確認
5. コピーボタンの動作確認
6. エラーケースのテスト（不正な入力、@username など）

## システムユーティリティコマンド（WSL2/Ubuntu）

### ディレクトリ操作
```bash
cd <directory>
pwd
ls
mkdir <directory>
```

### ファイル操作
```bash
cp <source> <dest>
mv <source> <dest>
rm <file>
```

### パス変換（Windows → WSL2）
- Windows: `C:\Users\littl\app-dev\05_YouTubeListTool\YouTubeListTool`
- WSL2: `/mnt/c/Users/littl/app-dev/05_YouTubeListTool/YouTubeListTool`
