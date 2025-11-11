# YouTube視聴履歴分析ツール - 要件定義書

**作成日**: 2025-11-11
**バージョン**: 1.0

---

## プロジェクト概要

### プロジェクト名
Video Watch History Analyzer

### 目的
自分のYouTube視聴履歴・コメント履歴を分析し、「前に見た動画」を思い出すための学習振り返りツール

### ユースケース
- 「前にYouTubeで見た気がするけどどんな内容であったか思い出せない」
- 「どの動画で学んだか特定したい」
- 「自分のYouTube学習履歴をまとめたい」

### 背景
現行の「YouTube List Tool」はチャンネル単位での動画取得に特化しているが、本ツールは**個人の視聴履歴**に焦点を当て、学習の振り返りを支援する。

---

## 📞 ユーザー特性（重要）

このプロジェクトの主要ユーザーは**非エンジニア**です。開発者・AIアシスタントは以下の特性を常に考慮してください。

### ユーザーの特徴
- **非エンジニア**: プログラミングや技術用語に不慣れ
- **詳細でわかりやすい説明が必要**: 省略せず、丁寧に説明する
- **日常生活の例えを使うと理解しやすい**: 専門用語は身近な例えに置き換える
- **コマンドはコピペできる形で提示**: 完全な形で記載し、プレースホルダーは最小限
- **各ステップで確認を取りながら進める**: 1つずつ完了を確認してから次へ
- **「なぜそうするのか」の理解を重視**: 手順だけでなく、理由・目的を説明する

### 実装時の必須配慮

#### 1. エラーメッセージは具体的なアクションを示す
```typescript
// ❌ NG
throw new Error('Token expired');

// ✅ OK
throw new Error(
  'ログイン有効期限が切れました。\n' +
  '「ログアウト」→「再ログイン」で解決します。\n' +
  '（有効期限: 7日間）'
);
```

#### 2. UIラベルは結果が予測できる表現
- ❌ NG: 「送信」
- ✅ OK: 「視聴履歴を取得」

#### 3. プログレスバーは具体的な進捗を表示
```typescript
// ✅ OK
<div>
  <p>50件中25件取得完了（50%）</p>
  <p>あと約30秒</p>
</div>
```

#### 4. コマンドは実行前に説明＋実行後の確認方法も提示
```markdown
以下のコマンドで、必要なライブラリをインストールします（3-5分かかります）。

​```bash
npm install
​```

実行後、「added 1234 packages」のようなメッセージが表示されれば成功です。
```

### コミュニケーション例

#### 悪い例（専門用語が多い）
```
OAuth 2.0でアクセストークンを取得し、Authorization Headerに含めてリクエストします。
トークンが期限切れの場合はリフレッシュトークンで再取得してください。
```

#### 良い例（平易な言葉＋例え）
```
**なぜログインが必要か：**
YouTube APIを使うには、Googleに「この人は誰か」を証明する必要があります。
これは図書館で本を借りるときに、図書館カードを見せるのと同じです。

**仕組み：**
1. 最初にGoogleログインすると、「利用証」（アクセストークン）がもらえます
2. この利用証があれば、毎回ログインしなくてもデータを取得できます
3. 利用証の有効期限は7日間です
4. 期限が切れたら、再度ログインして新しい利用証をもらいます

**あなたがすること：**
「Googleでログイン」ボタンをクリックするだけです。
```

---

## 技術スタック

### フロントエンド
| 項目 | 技術 | 理由 |
|------|------|------|
| フレームワーク | React 18 + Vite | 最も需要が高く、就職市場で有利。Viteで高速開発 |
| 言語 | TypeScript | 型安全な開発、大規模開発に必須のスキル |
| 状態管理 | React Context API | 小規模アプリには十分。Redux不要 |
| UIライブラリ | TailwindCSS | モダンなユーティリティファーストCSS、レスポンシブ対応が容易 |
| HTTP Client | Axios | インターセプター機能でトークン管理が容易 |

### バックエンド
| 項目 | 技術 | 理由 |
|------|------|------|
| プラットフォーム | Cloudflare Workers | 現アプリと同じ。サーバーレス、低コスト、エッジコンピューティング |
| 言語 | TypeScript | フロントエンドと共通言語で開発効率向上 |
| 認証 | OAuth 2.0（Google） | YouTube Data API v3のアクセスに必須 |
| ストレージ | KV Storage | アクセストークンキャッシュ（7日間TTL） |
| ストレージ | Durable Objects | セッション管理、レート制限 |
| API | YouTube Data API v3 | 視聴履歴・コメント履歴の取得 |

### デプロイ
| 項目 | 環境 | 備考 |
|------|------|------|
| フロントエンド | Cloudflare Pages | 自動デプロイ、CDN |
| バックエンド | Cloudflare Workers | wranglerでデプロイ |
| CI/CD | GitHub Actions | push時に自動デプロイ |

---

## MVP機能（Phase 1）

### 1. OAuth 2.0認証フロー

#### 機能概要
Googleアカウントでログインし、YouTube Data API v3へのアクセス権限を取得

#### 詳細仕様
- **認証方式**: OAuth 2.0（Authorization Code Flow）
- **スコープ**:
  - `https://www.googleapis.com/auth/youtube.readonly`（視聴履歴読み取り）
  - `https://www.googleapis.com/auth/youtube.force-ssl`（コメント読み取り）
- **トークン管理**:
  - アクセストークン: KV Storageに保存（7日間TTL）
  - リフレッシュトークン: KV Storageに暗号化して保存
  - 自動リフレッシュ機構（トークン期限切れ時）
- **ログアウト**: トークンをKV Storageから削除

#### UI要素
- 「Googleでログイン」ボタン
- ログイン状態表示（ユーザー名、アイコン）
- 「ログアウト」ボタン

---

### 2. 視聴履歴取得

#### 機能概要
YouTube Data API v3から自分の視聴履歴を取得し、表形式で表示

#### 詳細仕様
- **APIエンドポイント**: `playlistItems.list`
- **プレイリストID**: `HL`（視聴履歴専用プレイリスト）
- **取得件数選択**:
  - 50件
  - 100件
  - 500件
  - 全件（上限なし）
- **日付範囲フィルター**:
  - 過去1週間
  - 過去1ヶ月
  - 過去3ヶ月
  - 過去1年
  - 全期間
- **段階的ロード**:
  - 50件単位でページング
  - プログレスバー表示（0%〜100%）
  - 「さらに読み込む」ボタン
- **キャンセル機能**: AbortControllerで中断可能

#### 取得データ項目
- 動画ID（videoId）
- タイトル（title）
- チャンネル名（channelName）
- チャンネルID（channelId）
- 公開日（publishedAt）
- **視聴日**（watchedAt） ← 重要

#### UI要素
- 取得件数選択ドロップダウン
- 日付範囲選択（開始日・終了日）
- 「取得開始」ボタン
- プログレスバー
- 「キャンセル」ボタン
- 結果テーブル

---

### 3. コメント履歴取得

#### 機能概要
視聴履歴の各動画に対して、自分のコメントを検索・取得

#### 詳細仕様
- **APIエンドポイント**: `commentThreads.list`
- **検索方法**: 視聴履歴の各動画IDに対して順次検索
- **フィルター機能**:
  - 「コメントありのみ表示」トグル
  - コメント内容でテキスト検索
- **パフォーマンス最適化**:
  - Promise Pool（同時3リクエスト）
  - KV Storageでキャッシュ（7日間TTL）

#### 取得データ項目
- コメントID（commentId）
- コメント内容（text）
- コメント投稿日（publishedAt）

#### UI要素
- 「コメントを取得」ボタン
- 「コメントありのみ」トグルスイッチ
- コメント内容検索ボックス
- テーブルのコメント列

---

### 4. 基本的な表示・検索機能

#### テーブル表示
| 列名 | 内容 | ソート | 備考 |
|------|------|--------|------|
| タイトル | 動画タイトル | ○ | クリックでYouTube開く |
| チャンネル名 | チャンネル名 | ○ | クリックでチャンネル開く |
| 公開日 | 動画の公開日 | ○ | YYYY-MM-DD形式 |
| 視聴日 | 視聴した日時 | ○ | YYYY-MM-DD HH:mm形式 |
| コメント | 自分のコメント | - | なければ空欄 |

#### 検索機能
- **フリーテキスト検索**: タイトル・チャンネル名・コメント内容を部分一致で検索
- **絞り込み検索**:
  - 日付範囲（視聴日・公開日）
  - チャンネル名（ドロップダウン）
  - コメントあり/なし

#### ソート機能
- 視聴日（昇順・降順）
- 公開日（昇順・降順）
- チャンネル名（A-Z）
- タイトル（A-Z）

#### ページネーション
- 50件/ページ
- 「前へ」「次へ」ボタン
- ページ番号表示（1/10など）

---

### 5. エクスポート機能

#### 機能概要
取得した視聴履歴をCSV/JSON形式でダウンロード

#### エクスポート形式

##### CSV形式（Excel対応）
```csv
タイトル,チャンネル名,公開日,視聴日,URL,コメント
"動画タイトル1","チャンネルA","2025-01-01","2025-01-15","https://www.youtube.com/watch?v=abc123","コメント内容"
"動画タイトル2","チャンネルB","2025-01-05","2025-01-16","https://www.youtube.com/watch?v=def456",""
```

##### JSON形式（NotebookLM用）
```json
{
  "urls": [
    "https://www.youtube.com/watch?v=abc123",
    "https://www.youtube.com/watch?v=def456"
  ],
  "titles": [
    "動画タイトル1",
    "動画タイトル2"
  ],
  "watchedDates": [
    "2025-01-15T10:30:00Z",
    "2025-01-16T08:00:00Z"
  ],
  "comments": [
    "コメント内容",
    ""
  ]
}
```

##### テキスト形式（NotebookLM貼り付け用）
```
# URLs
https://www.youtube.com/watch?v=abc123
https://www.youtube.com/watch?v=def456

# Titles
動画タイトル1
動画タイトル2

# Watched Dates
2025-01-15T10:30:00Z
2025-01-16T08:00:00Z

# Comments
コメント内容
（なし）
```

#### UI要素
- 「CSVでエクスポート」ボタン
- 「JSONでエクスポート」ボタン
- 「テキストでエクスポート」ボタン
- ファイル名: `youtube-history-YYYY-MM-DD.{csv|json|txt}`

---

## 受入れ基準（Acceptance Criteria）

### AC1: OAuth 2.0認証
- [ ] 「Googleでログイン」ボタンを押すと、Google認証画面に遷移する
- [ ] 認証成功後、ダッシュボード画面に戻り、ユーザー名が表示される
- [ ] トークンがKV Storageに保存され、7日間有効である
- [ ] 「ログアウト」ボタンでトークンが削除され、ログイン画面に戻る
- [ ] トークン期限切れ時、自動リフレッシュが実行される

### AC2: 視聴履歴取得
- [ ] 件数（50/100/500/全件）と日付範囲を指定して「取得」ボタンを押すと、視聴履歴が表示される
- [ ] プログレスバーが0%から100%まで正常に動作する
- [ ] 「キャンセル」ボタンでリクエストが中断され、取得済みデータのみ表示される
- [ ] 500件以上取得しても、フリーズせず正常に動作する
- [ ] 視聴日が正しく表示される

### AC3: コメント履歴取得
- [ ] 「コメントを取得」ボタンで、視聴履歴の各動画のコメントが取得される
- [ ] コメントがある動画のみテーブルに表示される
- [ ] 「コメントありのみ」トグルで、コメントなし動画が非表示になる
- [ ] コメント内容でテキスト検索できる

### AC4: 検索・ソート
- [ ] タイトル検索が部分一致（大文字小文字区別なし）で動作する
- [ ] 視聴日でソート（昇順・降順）できる
- [ ] ページネーションが正常に動作し、50件/ページ表示される
- [ ] 複数の絞り込み条件を組み合わせて使用できる

### AC5: エクスポート
- [ ] CSV形式でダウンロードでき、Excelで開ける
- [ ] JSON形式でダウンロードでき、有効なJSON構文である
- [ ] テキスト形式でダウンロードでき、NotebookLMに貼り付けて使える
- [ ] ファイル名に日付（YYYY-MM-DD）が含まれる

---

## 非機能要件

### パフォーマンス
| 項目 | 目標値 | 備考 |
|------|--------|------|
| 初回表示 | 3秒以内 | ログイン後のダッシュボード表示 |
| 50件取得 | 5秒以内 | YouTube Data API v3レスポンス含む |
| 500件取得 | 30秒以内 | 段階的ロードでUI操作可能 |
| コメント取得（100動画） | 60秒以内 | Promise Pool（同時3リクエスト） |
| エクスポート（500件） | 2秒以内 | ブラウザ内処理のみ |

### API クォータ消費目安
| 操作 | 消費ユニット | 備考 |
|------|-------------|------|
| 視聴履歴取得（50件） | 1ユニット | playlistItems.list |
| コメント検索（1動画） | 1ユニット | commentThreads.list |
| 500件の視聴履歴 + 全コメント | 約510ユニット | 1日の上限10,000ユニット |

**対策**: KV Storageで7日間キャッシュ → 実質的なクォータ消費を大幅削減

### セキュリティ
| 項目 | 対策 | 実装方法 |
|------|------|----------|
| XSS対策 | エスケープ処理 | Reactの標準エスケープ |
| CORS設定 | オリジン制限 | Cloudflare Workers |
| トークン管理 | 暗号化保存 | KV Storage + 暗号化 |
| HTTPS | 強制 | Cloudflare Pages |
| APIキー管理 | 環境変数 | wrangler secret |

### ユーザビリティ
| 項目 | 要件 | 実装方法 |
|------|------|----------|
| レスポンシブデザイン | スマホ対応 | TailwindCSS |
| ダークモード | 自動切り替え | prefers-color-scheme + LocalStorage |
| ローディング表示 | 明確な進行状況 | プログレスバー + パーセント表示 |
| エラーメッセージ | 分かりやすい日本語 | 構造化エラー + リカバリー提案 |
| アクセシビリティ | ARIA対応 | セマンティックHTML |

---

## ディレクトリ構造案

```
youtube-watch-history-analyzer/
├── frontend/                     # React + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── Auth/
│   │   │   │   ├── LoginButton.tsx
│   │   │   │   ├── LogoutButton.tsx
│   │   │   │   └── UserProfile.tsx
│   │   │   ├── HistoryTable/
│   │   │   │   ├── HistoryTable.tsx
│   │   │   │   ├── SearchBar.tsx
│   │   │   │   ├── FilterPanel.tsx
│   │   │   │   └── Pagination.tsx
│   │   │   ├── Export/
│   │   │   │   └── ExportButtons.tsx
│   │   │   └── Common/
│   │   │       ├── ProgressBar.tsx
│   │   │       ├── ErrorMessage.tsx
│   │   │       ├── LoadingSpinner.tsx
│   │   │       └── ThemeToggle.tsx
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx
│   │   │   └── ThemeContext.tsx
│   │   ├── services/
│   │   │   ├── api.ts           # Axios設定
│   │   │   ├── youtubeService.ts
│   │   │   └── authService.ts
│   │   ├── types/
│   │   │   ├── youtube.ts
│   │   │   └── auth.ts
│   │   ├── utils/
│   │   │   ├── exportData.ts
│   │   │   ├── dateFormatter.ts
│   │   │   ├── promisePool.ts    # 現アプリから流用
│   │   │   └── errorHandler.ts
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useHistory.ts
│   │   │   └── useDebounce.ts
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   └── DashboardPage.tsx
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── public/
│   │   └── favicon.ico
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── .env.example
│   └── package.json
├── backend/                      # Cloudflare Workers
│   ├── src/
│   │   ├── handlers/
│   │   │   ├── auth.ts          # OAuth 2.0フロー
│   │   │   ├── history.ts       # 視聴履歴取得
│   │   │   └── comments.ts      # コメント取得
│   │   ├── services/
│   │   │   ├── youtubeApi.ts    # YouTube Data API v3ラッパー
│   │   │   └── tokenService.ts  # トークン管理
│   │   ├── middleware/
│   │   │   ├── cors.ts
│   │   │   ├── auth.ts          # トークン検証
│   │   │   └── errorHandler.ts
│   │   ├── types/
│   │   │   ├── index.ts
│   │   │   └── env.ts
│   │   ├── utils/
│   │   │   └── encryption.ts    # トークン暗号化
│   │   └── index.ts             # エントリーポイント
│   ├── wrangler.toml
│   ├── tsconfig.json
│   └── package.json
├── .github/
│   └── workflows/
│       ├── deploy-frontend.yml
│       └── deploy-backend.yml
├── .docs/
│   ├── DEPLOYMENT_CHECKLIST.md
│   ├── API_DESIGN.md
│   ├── OAUTH2_SETUP.md          # OAuth 2.0設定手順
│   └── HANDOVER/
│       └── HANDOVER_phase1.md
├── README.md
├── CLAUDE.md                     # 開発ルール（現アプリから流用）
├── .gitignore
└── LICENSE
```

---

## API設計（Workers エンドポイント）

### ベースURL
- **開発**: `http://localhost:8787`
- **本番**: `https://youtube-history-analyzer.your-subdomain.workers.dev`

### 認証系エンドポイント

#### POST /auth/google
Google OAuth 2.0認証フローを開始

**Request**
```http
POST /auth/google
Content-Type: application/json

{}
```

**Response**
```json
{
  "ok": true,
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&scope=...&state=..."
}
```

---

#### GET /auth/callback
OAuth 2.0コールバック処理

**Request**
```http
GET /auth/callback?code=4/0AfgeXvs...&state=random_state_string
```

**Response**
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 604800,
  "user": {
    "id": "1234567890",
    "name": "山田太郎",
    "email": "taro@example.com",
    "picture": "https://lh3.googleusercontent.com/..."
  }
}
```

**Error Response**
```json
{
  "ok": false,
  "code": "AUTH_FAILED",
  "message": "認証に失敗しました。もう一度お試しください。"
}
```

---

#### POST /auth/refresh
アクセストークンをリフレッシュ

**Request**
```http
POST /auth/refresh
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{}
```

**Response**
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 604800
}
```

---

#### POST /auth/logout
ログアウト（トークン無効化）

**Request**
```http
POST /auth/logout
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{}
```

**Response**
```json
{
  "ok": true,
  "message": "ログアウトしました"
}
```

---

### 視聴履歴系エンドポイント

#### GET /history
視聴履歴を取得

**Request**
```http
GET /history?limit=50&dateFrom=2025-01-01&dateTo=2025-01-31&pageToken=CAoQAA
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Query Parameters**
| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| limit | number | No | 50 | 取得件数（1-50） |
| dateFrom | string | No | - | 開始日（ISO形式） |
| dateTo | string | No | - | 終了日（ISO形式） |
| pageToken | string | No | - | 次ページトークン |

**Response**
```json
{
  "ok": true,
  "videos": [
    {
      "videoId": "abc123",
      "title": "React Hooksの使い方",
      "channelName": "プログラミング学習チャンネル",
      "channelId": "UC1234567890abcdef",
      "publishedAt": "2025-01-01T00:00:00Z",
      "watchedAt": "2025-01-15T10:30:00Z",
      "thumbnail": "https://i.ytimg.com/vi/abc123/default.jpg"
    },
    {
      "videoId": "def456",
      "title": "TypeScript入門",
      "channelName": "Tech解説",
      "channelId": "UC0987654321fedcba",
      "publishedAt": "2024-12-20T08:00:00Z",
      "watchedAt": "2025-01-15T11:00:00Z",
      "thumbnail": "https://i.ytimg.com/vi/def456/default.jpg"
    }
  ],
  "nextPageToken": "CAoQAA",
  "totalCount": 500,
  "quotaUsed": 1
}
```

**Error Response**
```json
{
  "ok": false,
  "code": "QUOTA_EXCEEDED",
  "message": "APIクォータを超過しました。明日再度お試しください。"
}
```

---

#### GET /history/:videoId/comments
特定動画の自分のコメントを取得

**Request**
```http
GET /history/abc123/comments
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response**
```json
{
  "ok": true,
  "comments": [
    {
      "commentId": "UgxKREhc_NXNgxVoe_Z4AaABAg",
      "text": "とても分かりやすい解説でした！",
      "publishedAt": "2025-01-15T11:00:00Z",
      "likeCount": 5
    }
  ],
  "quotaUsed": 1
}
```

---

#### POST /history/batch-comments
複数動画のコメントを一括取得

**Request**
```http
POST /history/batch-comments
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "videoIds": ["abc123", "def456", "ghi789"]
}
```

**Response**
```json
{
  "ok": true,
  "results": [
    {
      "videoId": "abc123",
      "comments": [
        {
          "commentId": "UgxKREhc_NXNgxVoe_Z4AaABAg",
          "text": "とても分かりやすい解説でした！",
          "publishedAt": "2025-01-15T11:00:00Z",
          "likeCount": 5
        }
      ]
    },
    {
      "videoId": "def456",
      "comments": []
    }
  ],
  "quotaUsed": 3
}
```

---

### エラーコード一覧

| コード | 説明 | HTTPステータス |
|--------|------|---------------|
| `AUTH_FAILED` | 認証失敗 | 401 |
| `TOKEN_EXPIRED` | トークン期限切れ | 401 |
| `INVALID_TOKEN` | 無効なトークン | 401 |
| `QUOTA_EXCEEDED` | APIクォータ超過 | 429 |
| `RATE_LIMIT_EXCEEDED` | レート制限超過 | 429 |
| `VIDEO_NOT_FOUND` | 動画が見つからない | 404 |
| `PRIVATE_VIDEO` | プライベート動画 | 403 |
| `INTERNAL_ERROR` | サーバーエラー | 500 |

---

## 開発フェーズ

### Phase 1（MVP）: 基本機能実装（2-3週間）

#### Week 1: セットアップ + 認証
- [ ] プロジェクトセットアップ（React + Vite + TypeScript）
- [ ] TailwindCSS + ダークモード設定
- [ ] Cloudflare Workers環境構築
- [ ] OAuth 2.0実装（Google Cloud Console設定）
- [ ] ログイン・ログアウト機能

#### Week 2: 視聴履歴取得
- [ ] YouTube Data API v3連携
- [ ] 視聴履歴取得エンドポイント実装
- [ ] フロントエンド: テーブル表示
- [ ] フロントエンド: プログレスバー
- [ ] フロントエンド: キャンセル機能

#### Week 3: 検索・エクスポート
- [ ] フリーテキスト検索
- [ ] ソート機能
- [ ] ページネーション
- [ ] CSV/JSONエクスポート
- [ ] デプロイ設定（Cloudflare Pages + Workers）

---

### Phase 2: 拡張機能（1-2週間）

#### コメント履歴
- [ ] コメント取得エンドポイント実装
- [ ] バッチ取得（Promise Pool）
- [ ] KV Storageキャッシュ
- [ ] フロントエンド: コメント列追加
- [ ] フロントエンド: コメント検索

#### 高度な検索
- [ ] 複数条件絞り込み
- [ ] チャンネル名フィルター
- [ ] お気に入り機能（LocalStorage）

#### パフォーマンス最適化
- [ ] 仮想スクロール（1000件以上対応）
- [ ] Workerキャッシュ強化
- [ ] バンドルサイズ削減

---

### Phase 3: LLM連携（検討中）

#### サマリー生成
- [ ] Claude API連携
- [ ] 視聴履歴のサマリー自動生成
- [ ] 学習テーマの抽出
- [ ] 「似た動画を探す」機能

#### 学習ノート
- [ ] 動画ごとのメモ機能
- [ ] タグ付け機能
- [ ] Markdown対応

---

## 現アプリからの流用・応用

### 流用する設計パターン

#### 1. Promise Pool（app.js: 1113-1127行）
```typescript
// 同時実行数を制限しながら順序を保証
async function runWithLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
```

**用途**: コメント一括取得（100動画を同時3リクエストで処理）

---

#### 2. Abort Controller（app.js: 373-414行）
```typescript
// キャンセル・タイムアウト制御
const abortController = new AbortController();

async function fetchWithTimeout(url: string, timeout: number) {
  const timeoutId = setTimeout(() => abortController.abort(), timeout);

  try {
    const response = await fetch(url, { signal: abortController.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('リクエストがキャンセルされました');
    }
    throw error;
  }
}
```

**用途**: 視聴履歴取得のキャンセル機能

---

#### 3. Progressive Loading（app.js: 416-496行）
```typescript
// 段階的データ取得とUI更新
async function fetchHistoryProgressive(limit: number) {
  let pageToken: string | null = null;
  let allVideos: Video[] = [];

  do {
    const response = await fetchHistory({ limit: 50, pageToken });
    allVideos = [...allVideos, ...response.videos];

    // UI更新
    updateProgress(allVideos.length / limit);
    renderTable(allVideos);

    pageToken = response.nextPageToken;
  } while (pageToken && allVideos.length < limit);

  return allVideos;
}
```

**用途**: 500件以上の視聴履歴取得

---

#### 4. 構造化エラー（app.js: 337-371行）
```typescript
interface ApiResponse<T> {
  ok: boolean;
  code?: string;
  message?: string;
  data?: T;
}

// エラーハンドリング
if (!response.ok) {
  return {
    ok: false,
    code: 'FETCH_FAILED',
    message: 'データの取得に失敗しました'
  };
}
```

**用途**: Workers全体のエラーハンドリング

---

#### 5. CORS設定（workers/youtube-proxy.js: 20-28行）
```typescript
const ALLOWED_ORIGINS = [
  'http://localhost:5173',  // Vite開発サーバー
  'https://youtube-history-analyzer.pages.dev',
];

function corsHeaders(origin: string) {
  if (ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
  }
  return {};
}
```

**用途**: Workers側のCORS設定

---

### 流用するコード（部分的）

#### 1. exportAsCSV（app.js: 1015-1050行）
```typescript
function exportAsCSV(data: Video[]) {
  const headers = ['タイトル', 'チャンネル名', '公開日', '視聴日', 'URL', 'コメント'];
  const rows = data.map(video => [
    video.title,
    video.channelName,
    video.publishedAt,
    video.watchedAt,
    `https://www.youtube.com/watch?v=${video.videoId}`,
    video.comment || ''
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  downloadFile(csvContent, `youtube-history-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
}
```

---

#### 2. ダークモード実装（style.css: 1-149行 + app.js: 1-61行）
```css
:root {
  --text-primary: #333;
  --bg-primary: #fff;
}

[data-theme='dark'] {
  --text-primary: #e0e0e0;
  --bg-primary: #1e1e1e;
}
```

```typescript
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    setTheme(savedTheme);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
  }
}
```

**Reactへの移行**: Context API + TailwindCSSのdark:クラス

---

### 新規実装が必要な部分

#### 1. OAuth 2.0認証フロー（全体）
- Google Cloud Console設定
- Authorization Code Flow実装
- トークン管理（KV Storage）
- 自動リフレッシュ機構

#### 2. React コンポーネント設計
- 関数コンポーネント + Hooks
- Context API（Auth, Theme）
- カスタムHooks（useAuth, useHistory）

#### 3. TypeScript型定義
```typescript
// types/youtube.ts
export interface Video {
  videoId: string;
  title: string;
  channelName: string;
  channelId: string;
  publishedAt: string;
  watchedAt: string;
  thumbnail: string;
  comment?: string;
}

export interface HistoryResponse {
  ok: boolean;
  videos: Video[];
  nextPageToken?: string;
  totalCount: number;
  quotaUsed: number;
}
```

#### 4. Vite + TailwindCSS設定
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787'
    }
  }
});
```

---

## リスク・課題

### 高リスク

#### 1. YouTube Data API クォータ制限
**問題**:
- 視聴履歴取得: 1ユニット/リクエスト
- コメント検索: 1ユニット/動画
- 500件の視聴履歴 + 全動画のコメント検索 = 約510ユニット
- 1日の上限: 10,000ユニット

**対策**:
- KV Storageで7日間キャッシュ
- ユーザーに「コメント取得は選択制」と明示
- クォータ使用量をUI表示

**実装例**:
```typescript
// KV Storageキャッシュ
const cacheKey = `history:${userId}:${dateFrom}:${dateTo}`;
const cached = await env.KV.get(cacheKey, 'json');
if (cached) {
  return cached;
}

const data = await fetchFromYouTubeAPI();
await env.KV.put(cacheKey, JSON.stringify(data), { expirationTtl: 604800 }); // 7日間
return data;
```

---

#### 2. OAuth 2.0実装の複雑性
**問題**:
- 学習コスト高（初めての場合）
- Google Cloud Consoleの設定が複雑
- トークン管理（リフレッシュ、無効化）

**対策**:
- Google公式ドキュメント準拠
- `.docs/OAUTH2_SETUP.md`に詳細手順を記載
- 段階的実装（まず認証のみ → トークンリフレッシュ → 自動リフレッシュ）

**参考資料**:
- [Google OAuth 2.0公式ドキュメント](https://developers.google.com/identity/protocols/oauth2)
- [YouTube Data API v3認証ガイド](https://developers.google.com/youtube/v3/guides/authentication)

---

### 中リスク

#### 3. 視聴履歴の取得制限
**問題**:
- YouTube Data API v3では自分の履歴のみアクセス可能
- 一部のプライベート動画は取得できない可能性
- 削除された動画は表示できない

**対策**:
- エラーハンドリング強化
- 「取得できなかった動画」をUI表示
- ユーザーに制限を明示

---

#### 4. Cloudflare Workers無料プランの制限
**制限**:
- リクエスト: 100,000リクエスト/日
- CPU時間: 10ms/リクエスト
- KV Storage: 100,000読み取り/日、1,000書き込み/日

**対策**:
- バッチ処理でリクエスト数削減
- キャッシュ活用
- 有料プラン（$5/月）への移行を検討

---

## 学習目標

### フロントエンド
- [ ] React 18の関数コンポーネント + Hooks
- [ ] TypeScriptでの型安全な開発
- [ ] React Context APIによる状態管理
- [ ] Viteによる高速開発環境構築
- [ ] TailwindCSSによるモダンなUI設計
- [ ] レスポンシブデザイン実装
- [ ] ダークモード実装

### バックエンド
- [ ] Cloudflare Workersのエッジコンピューティング
- [ ] OAuth 2.0認証フローの実装
- [ ] KV Storage / Durable Objectsの活用
- [ ] REST API設計
- [ ] CORS設定とセキュリティ
- [ ] エラーハンドリング

### 全般
- [ ] フロントエンド・バックエンド分離アーキテクチャ
- [ ] CI/CDパイプライン構築（GitHub Actions）
- [ ] セキュアなAPI設計（トークン管理）
- [ ] パフォーマンス最適化（Promise Pool、キャッシュ）
- [ ] ユーザビリティ向上（プログレスバー、エラーメッセージ）

---

## 開発環境セットアップ手順

### 必要なツール
- Node.js 18以上
- npm または yarn
- Git
- Cloudflare アカウント
- Google Cloud アカウント（YouTube Data API v3有効化）

### セットアップコマンド
```bash
# 1. プロジェクト作成
mkdir youtube-watch-history-analyzer
cd youtube-watch-history-analyzer

# 2. フロントエンド
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install axios tailwindcss postcss autoprefixer
npx tailwindcss init -p

# 3. バックエンド
cd ..
mkdir backend
cd backend
npm init -y
npm install -D wrangler typescript @cloudflare/workers-types
npm install

# 4. Cloudflare Workers初期化
npx wrangler init

# 5. KV Namespace作成
npx wrangler kv:namespace create "TOKENS"
npx wrangler kv:namespace create "CACHE"

# 6. Google Cloud Console設定
# → OAuth 2.0クライアントID作成
# → YouTube Data API v3有効化
# → リダイレクトURI設定

# 7. 環境変数設定
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put YOUTUBE_API_KEY
```

---

## 参考資料

### 公式ドキュメント
- [React公式ドキュメント](https://react.dev/)
- [Vite公式ドキュメント](https://vitejs.dev/)
- [TailwindCSS公式ドキュメント](https://tailwindcss.com/)
- [Cloudflare Workers公式ドキュメント](https://developers.cloudflare.com/workers/)
- [YouTube Data API v3リファレンス](https://developers.google.com/youtube/v3/docs)
- [Google OAuth 2.0公式ドキュメント](https://developers.google.com/identity/protocols/oauth2)

### 現アプリ
- [YouTube List Tool - GitHub](現リポジトリ)
- [YouTube List Tool - 本番環境](https://youtubelisttool.pages.dev)

---

## バージョン履歴
- **v1.0** (2025-11-11): 初版作成

---

## 開発ルール（CLAUDE.md準拠）

### 守るべき作業ルール（必須）
1. **絶対に自動で `git commit` や `git push` を実行しないこと。** 生成コードは必ず差分（`git diff` 相当）を提示し、人間の承認を得てからローカルで commit/push する。
2. 変更を提案する前に、変更の目的と影響を自然言語で要約して示すこと。
3. 秘密情報（APIキー等）をコード中に直接書かない。`.env.example` を提示し、実値はユーザーに設定させる。
4. 生成するファイル・ファイル名を作成前に提示すること（例：`LoginButton.tsx` を作る／`auth.ts` を更新する）。
5. テスト手順や手動確認方法（ブラウザでの確認手順）を必ず提示すること。

### 禁止事項（厳守）
- 自動で GitHub に push すること。
- シークレットをハードコーディングすること。
- README に書かれていない実行方法で動かすこと（事前に相談する）。
- アプリ名に「YouTube」「YT」を含めること（ブランディングガイドライン違反）。

### 運用上の技術的ブロック（人が実施すること）
- リポジトリ直下に `.git/hooks/pre-push` を設置して、通常の push をブロックすること（ユーザーが明示して ALLOW_PUSH=1 等で解除できる方式を推奨）。
- GitHub 側では main ブランチにブランチ保護ルールを設定し、直接 push を禁止する。

### 最終確認ルール（コミット前）
- 生成された差分を表示 → ユーザー承認 → ユーザーがローカルで `git add/commit` を実行 → PR を作成してレビューの上でマージ（必要に応じて）という流れを守る。

### MUST - Critical Rules
- MUST WindowsのパスはUbuntuのマウントパスに変換すること
- 例: `C:\Users\user1\Pictures\test.jpg` → `/mnt/c/Users/user1/Pictures/test.jpg`

---

## セキュリティとコンプライアンス対応

### YouTube API利用時の必須対応

#### ポリシー順守（YouTube API サービス利用規約）

**参考**:
- [YouTube API サービス利用規約](https://developers.google.com/youtube/terms/developer-policies?hl=ja)
- [YouTube API サービス - 開発者ポリシー](https://developers.google.com/youtube/terms/developer-policies-guide?hl=ja)
- [YouTube ブランディングガイドライン](https://developers.google.com/youtube/terms/branding-guidelines?hl=ja)

##### 1. 常時表示が必要なリンク

```html
<!-- index.html のフッターまたはヘッダーに配置 -->
<footer class="legal-links">
  <a href="privacy-policy.html">プライバシーポリシー</a> |
  <a href="terms.html">利用規約</a> |
  <a href="https://www.youtube.com/t/terms" target="_blank">YouTube 利用規約</a> |
  <a href="https://policies.google.com/privacy" target="_blank">Google プライバシーポリシー</a>
</footer>
```

##### 2. データアクセスの同意取得

```html
<!-- 初回使用時に表示するモーダル -->
<div id="consent-modal">
  <h2>データアクセスの許可</h2>
  <p>本アプリは YouTube Data API を使用して以下のデータにアクセスします：</p>
  <ul>
    <li>視聴履歴（動画ID、タイトル、チャンネル名、視聴日時）</li>
    <li>コメント履歴（コメント内容、投稿日時）</li>
  </ul>
  <p>
    <a href="https://policies.google.com/privacy" target="_blank">Google プライバシーポリシー</a>
    および
    <a href="https://www.youtube.com/t/terms" target="_blank">YouTube 利用規約</a>
    に同意する必要があります。
  </p>
  <p>
    データアクセスは
    <a href="https://security.google.com/settings/security/permissions" target="_blank">
      Google セキュリティ設定
    </a>
    からいつでも取り消すことができます。
  </p>
  <label>
    <input type="checkbox" id="api-consent" required>
    上記に同意してYouTube Data APIの使用を許可します
  </label>
  <button id="accept-consent">同意して続行</button>
</div>
```

##### 3. プライバシーポリシーの必須記載内容

`privacy-policy.html` を新規作成し、以下を記載：

- YouTube API サービスの使用について
- 収集する情報の詳細（視聴履歴、コメント履歴）
- データの使用目的（学習振り返り、検索、エクスポート）
- データの保存期間（KV Storage: 7日間キャッシュ）
- データの共有先（なし。すべてユーザーのブラウザ内で処理）
- ユーザーの権利（データアクセスの取り消し、削除リクエスト）
- Cookie とトラッキング（使用しない）
- お問い合わせ先（GitHubリポジトリのIssues）
- ポリシーの変更について

---

### APIキーの流出対策（必須）

#### ❌ 間違った考え方

```javascript
// api-key.js
// 「このリポジトリはPrivateだから安全」と考えてAPIキーを書く
const YOUTUBE_API_KEY = "AIzaSyXXXXXXXXXXXXXXXXXX"; // ❌ 絶対にNG

// git add api-key.js
// git commit -m "Add API key"
// git push
```

#### ⚠️ なぜ危険なのか

| リスク | 内容 |
|-------|------|
| **Git履歴に永久保存** | 後でファイルを削除しても履歴に残る |
| **誤って公開** | リポジトリ設定を誤ってPublicにする可能性 |
| **アカウント侵害** | GitHubアカウントが乗っ取られたらPrivateも見られる |
| **CI/CDログに露出** | GitHub Actions のログ、デバッグ出力に平文で記録 |
| **ブラウザから見える** | フロントエンドで使うと開発者ツールで誰でも取得可能 |

#### ✅ 正しい方法：バックエンド + 環境変数

##### コード内での扱い

```javascript
// ❌ NG: コードに直接書く
const API_KEY = "AIzaSyXXXXXXXXXXXXXXXXXX";

// ✅ OK: 環境変数から取得
const API_KEY = env.YOUTUBE_API_KEY;
```

##### .gitignore に追加

```gitignore
# 環境変数ファイルは Git にコミットしない
.env
.env.local
.env.production
```

##### .env.example をコミット（サンプルのみ）

```bash
# .env.example (サンプルのみ)
YOUTUBE_API_KEY=your_api_key_here
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

##### 環境変数の設定（Cloudflare Workers）

```bash
# Workersに環境変数を設定
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

##### 実装例：Cloudflare Workers（必須アーキテクチャ）

```
[ユーザー]
    ↓ チャンネルID
[フロントエンド (Cloudflare Pages)]
    ↓ HTTPS リクエスト（APIキーなし）
[バックエンド API (Cloudflare Workers)]
    ↓ APIキーを使用（環境変数から取得）
[YouTube Data API]
```

```javascript
// workers/youtube-api.js (Cloudflare Workers)
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');

    // 環境変数からAPIキーを取得
    const API_KEY = env.YOUTUBE_API_KEY;

    // YouTube Data API を呼び出し
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&id=${channelId}&key=${API_KEY}`
    );

    const data = await response.json();

    // CORS ヘッダーを追加
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://your-app.pages.dev'
      }
    });
  }
};
```

```javascript
// app.js (フロントエンド)
async function fetchHistory() {
  // 自分のWorkers エンドポイントを呼び出し（APIキーは含めない）
  const response = await fetch(
    `https://your-worker.workers.dev/api/history`
  );
  const data = await response.json();
  return data;
}
```

---

### 認証・認可の実装（必須）

#### なぜ認証が必要か

##### シナリオA：認証なし（危険）

```
[悪意のあるユーザー]
    ↓ 大量のリクエスト（制限なし）
[あなたのバックエンドAPI]
    ↓ あなたのAPIキーを使用
[YouTube Data API]
    ↓
[APIクォータ超過 → あなたに課金]
```

**問題点**:
- 誰でもあなたのAPIを叩ける
- 悪意のあるユーザーが大量リクエストを送る
- あなたのYouTube API クォータを使い果たす
- 課金が発生する可能性

##### シナリオB：認証あり（安全）

```
[ユーザー]
    ↓ Googleログイン
[OAuth 2.0認証 (Google)]
    ↓ トークン発行
[ユーザー]
    ↓ トークン付きリクエスト
[あなたのバックエンドAPI]
    ↓ トークン検証 + レート制限
    ↓ あなたのAPIキーを使用
[YouTube Data API]
```

#### 実装例：認証 + レート制限

```javascript
// workers/youtube-api.js
export default {
  async fetch(request, env) {
    // 1. 認証トークンを検証
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 });
    }

    const token = authHeader.substring(7);

    // Google OAuth 2.0トークンを検証
    const isValid = await verifyGoogleToken(token);
    if (!isValid) {
      return new Response('Invalid token', { status: 403 });
    }

    // 2. レート制限を実装（Durable Objects使用）
    const userId = extractUserIdFromToken(token);
    const rateLimiterId = env.RATE_LIMITER.idFromName(userId);
    const rateLimiter = env.RATE_LIMITER.get(rateLimiterId);

    const isAllowed = await rateLimiter.checkLimit();
    if (!isAllowed) {
      return new Response('Rate limit exceeded', { status: 429 });
    }

    // 3. YouTube API を呼び出し
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=HL&key=${env.YOUTUBE_API_KEY}`
    );

    return response;
  }
};
```

---

### プライバシーポリシー（必須記載）

#### 本アプリケーション使用時に送信される情報

本ツールを使用すると、以下の情報が自動的に処理されます：

##### Google/YouTubeに送信される情報
- **Googleアカウント情報**: ログイン時にGoogleに送信（OAuth 2.0）
- **アクセストークン**: YouTube Data API v3へのアクセスに使用
- **視聴履歴リクエスト**: プレイリストID `HL`（視聴履歴）の取得リクエスト
- **コメント検索リクエスト**: 各動画のコメント検索リクエスト
- **IPアドレス**: YouTube Data API v3へのリクエスト時に自動送信

##### 本アプリケーションのバックエンド（Cloudflare Workers）に送信される情報
- **アクセストークン**: 認証・認可のため
- **ユーザーID**: レート制限のため（KV Storageに一時保存、7日間TTL）
- **リクエスト内容**: 取得件数、日付範囲、動画ID

#### 本アプリケーション自体によるデータ管理

本アプリケーション自体は：

- ✅ **視聴履歴データを永続保存しません**（すべてブラウザ内で処理されます）
- ✅ **KV Storageでキャッシュ**（7日間TTL、API クォータ削減のため）
- ✅ **サーバーログを記録しません**（Cloudflare Workersのデフォルト）
- ✅ **Cookie を使用しません**（トークンはAuthorization Header）
- ✅ **アクセス解析を行いません**（Cloudflare Analyticsのみ）

#### 利用者の同意

本ツールの「Googleでログイン」ボタンをクリックすることで、上記の情報が処理されることに同意したものとみなします。

---

## 補足事項

### デプロイ前チェックリスト

#### セキュリティ
- [ ] `.env.example`を作成（実値は含めない）
- [ ] `.env` を `.gitignore` に追加
- [ ] APIキーを環境変数で管理（wrangler secret put）
- [ ] wrangler.tomlにKV Namespace IDを設定
- [ ] CORS設定を本番ドメインに更新
- [ ] XSS対策（Reactの標準エスケープ）を確認

#### YouTube API ポリシー
- [ ] `privacy-policy.html` を作成
- [ ] `terms.html` を作成
- [ ] フッターに法的リンクを常時表示
- [ ] 初回使用時に同意モーダルを表示
- [ ] Google プライバシーポリシーへのリンクを追加
- [ ] YouTube 利用規約へのリンクを追加
- [ ] Google セキュリティ設定へのアクセス方法を説明

#### Google Cloud Console
- [ ] OAuth 2.0クライアントID作成
- [ ] YouTube Data API v3有効化
- [ ] リダイレクトURIを本番URLに追加（例: `https://your-app.pages.dev/auth/callback`）
- [ ] スコープ設定（`youtube.readonly`, `youtube.force-ssl`）

#### デプロイ設定
- [ ] GitHub Actionsワークフロー作成（`.github/workflows/deploy-*.yml`）
- [ ] Cloudflare Pagesのビルド設定（Vite: `npm run build`, 出力: `dist/`）
- [ ] Cloudflare Workers のデプロイ（`wrangler deploy`）

#### テスト
- [ ] スモークテスト実施（ログイン → 視聴履歴取得 → エクスポート）
- [ ] エラーハンドリング確認（トークン期限切れ、API クォータ超過）
- [ ] レスポンシブデザイン確認（スマホ、タブレット、PC）
- [ ] ダークモード動作確認

---

## 重要な公式ドキュメント

### 必読ドキュメント

#### YouTube/Google関連
- **[YouTube Data API v3リファレンス](https://developers.google.com/youtube/v3/docs)** - 全エンドポイントの詳細仕様
- **[YouTube API サービス利用規約](https://developers.google.com/youtube/terms/developer-policies?hl=ja)** - 必須遵守事項
- **[YouTube API サービス - 開発者ポリシー](https://developers.google.com/youtube/terms/developer-policies-guide?hl=ja)** - 詳細ガイド
- **[YouTube ブランディングガイドライン](https://developers.google.com/youtube/terms/branding-guidelines?hl=ja)** - アプリ名の制限
- **[Google OAuth 2.0公式ドキュメント](https://developers.google.com/identity/protocols/oauth2)** - 認証フロー実装
- **[YouTube Data API v3認証ガイド](https://developers.google.com/youtube/v3/guides/authentication)** - YouTube特有の認証
- **[Google プライバシーポリシー](https://policies.google.com/privacy)** - リンク必須
- **[YouTube 利用規約](https://www.youtube.com/t/terms)** - リンク必須

#### フレームワーク・ライブラリ
- **[React公式ドキュメント](https://react.dev/)** - React 18の最新情報
- **[Vite公式ドキュメント](https://vitejs.dev/)** - ビルド設定
- **[TailwindCSS公式ドキュメント](https://tailwindcss.com/)** - UIスタイリング
- **[Cloudflare Workers公式ドキュメント](https://developers.cloudflare.com/workers/)** - バックエンド実装
- **[Cloudflare KV Storage](https://developers.cloudflare.com/kv/)** - キャッシュ実装
- **[Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)** - レート制限実装

### ドキュメント参照の重要性

**実装時は必ず最新の公式ドキュメントを確認すること。** 以下の理由から：

1. **API仕様の変更**: YouTube Data API v3は予告なく変更される可能性がある
2. **クォータ制限の変更**: 消費ユニット数が変わる可能性がある
3. **ポリシーの更新**: YouTube API利用規約は定期的に更新される
4. **非推奨機能**: 古い実装が非推奨になる可能性がある
5. **セキュリティアップデート**: OAuth 2.0のベストプラクティスが変わる可能性がある

**本要件定義書の情報は2025-11-11時点のものであり、実装時は必ず公式ドキュメントで最新情報を確認すること。**

---

以上
