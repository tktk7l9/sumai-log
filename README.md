# sumai-log — 住まいログ

[![Keyway Secrets](https://www.keyway.sh/badge.svg?repo=tktk7l9/sumai-log)](https://www.keyway.sh/vaults/tktk7l9/sumai-log)

夫婦二人で使う、住まい探しの記録アプリ。見学した物件・依頼した業者・気になった土地を、
候補ごとにメモ・写真・地図つきで残していく。リポジトリは public だが、実データ
（二人のメール・表示名・見学先の住所や座標など）は D1 / R2 にしか置かず、コードには書かない。

## 技術構成

| 領域           | 採用                                                |
| -------------- | --------------------------------------------------- |
| フレームワーク | TanStack Start (React 19) on Cloudflare Workers     |
| UI             | Mantine v9                                          |
| DB             | Cloudflare D1 + Drizzle ORM                         |
| ファイル       | Cloudflare R2（非公開バケット・Phase 2）            |
| 地図           | Leaflet                                             |
| 認証           | Cloudflare Access（Google IdP）＋アプリ側 allowlist |

## セットアップ

```bash
npm install
cp .dev.vars.example .dev.vars   # 二人のメール・表示名を自分たちの値に書き換える
npm run db:migrate:local
npm run dev                      # http://localhost:3000
```

ローカルには Cloudflare Access が無いため、`.dev.vars` の `ENVIRONMENT=development` と
`DEV_IDENTITY_EMAIL` で認証を代替する。`wrangler.jsonc` の既定は `production` なので、
設定漏れがあっても本番でこの開発用経路が有効になることはない。

## よく使うコマンド

| コマンド                          | 内容                                                   |
| --------------------------------- | ------------------------------------------------------ |
| `npm run dev`                     | 開発サーバー                                           |
| `npm run typecheck`               | 型チェック                                             |
| `npm run test:coverage`           | 純粋関数のテスト＋カバレッジ（`src/lib` は 100% 必須） |
| `npm run test:server`             | 実 Workers ランタイム＋D1 に対するサーバー層のテスト   |
| `npm run format` / `format:check` | Prettier 整形／整形チェック                            |
| `npm run check:pii`               | 実データの混入チェック（照合元は `.dev.vars`）         |
| `npm run db:generate`             | `src/db/schema.ts` からマイグレーション生成            |
| `npm run db:migrate:local`        | ローカル D1 へ適用                                     |
| `npm run db:migrate:remote`       | 本番 D1 へ適用                                         |
| `npm run deploy`                  | ビルドしてデプロイ                                     |

## 本番

デプロイ先: `https://sumai-log.saitotakuya0719.workers.dev`（Cloudflare Access の背後）。
Worker は Access 設定（`ACCESS_TEAM_DOMAIN` / `ACCESS_POLICY_AUD`）か allowlist secret が
欠けていると **必ず 403 を返す**（fail-closed）。以下は初回構築の手順（実施済み）と、
以後の運用手順。

### 前提

```bash
npx wrangler login       # 未ログインなら
npx wrangler whoami       # account id を確認
```

### 1. D1 と R2

```bash
npx wrangler d1 create sumai-log            # 出力の database_id を wrangler.jsonc に貼る
npx wrangler r2 bucket create sumai-log-photos
npm run db:migrate:remote                   # drizzle/migrations の全件を本番 D1 に適用
```

同名の資源が既にあれば `npx wrangler d1 list` / `npx wrangler r2 bucket list` で確認して使い回す
（重複作成しない）。

### 2. 初回デプロイ（Access 設定前）

```bash
npm run deploy
curl -s -o /dev/null -w '%{http_code}\n' https://sumai-log.saitotakuya0719.workers.dev/
```

secret も Access 設定も無い状態なので `403` が返る。これは仕様どおり（拒否側に倒れている）。

### 3. Cloudflare Access アプリ

Zero Trust チームドメインは `https://odd-bush-1f0d.cloudflareaccess.com`（team `odd-bush-1f0d`）。
既存の Google IdP を使う。API（`POST /accounts/{account_id}/access/apps`、続けて
`POST /accounts/{account_id}/access/apps/{app_id}/policies`）で作成済み。ダッシュボードから
同じ設定をする場合の手順:

Zero Trust → Access → Applications → Add → Self-hosted:

- Application name: `sumai-log` ／ Session duration: **730h（約1ヶ月）**
- Application domain: `sumai-log.saitotakuya0719.workers.dev`
- Identity providers: 既設の Google だけを選ぶ（Auto-redirect to identity を有効化）
- Policy: Allow / Include → Emails → 利用者のアドレス（現在はオーナーのみ。パートナーの
  Gmail アドレスが判明したら Include に追加する）
- 作成後の Overview で **Application Audience (AUD) Tag** をコピーし、`wrangler.jsonc` の
  `ACCESS_TEAM_DOMAIN` / `ACCESS_POLICY_AUD` に反映する（どちらも非秘密＝コミットしてよい）

### 4. secret と `.dev.vars`

```bash
printf '%s' 'owner@example.com' | npx wrangler secret put ACCESS_ALLOWED_EMAILS
printf '%s' 'owner@example.com:名前:teal' | npx wrangler secret put MEMBERS
npx wrangler secret list        # 名前だけ確認できる。値の正しさはログインして確かめる
npm run deploy
```

`printf '%s'` を使う（`echo` だと末尾改行が値に混ざる）。引用符は値に含めない。
パートナーを追加するときは `ACCESS_ALLOWED_EMAILS` をカンマ区切りで、`MEMBERS` は
`email:表示名:Mantineの色名` をカンマ区切りで追記して同じコマンドで上書きする
（Access ポリシーの Include にもそのアドレスを追加すること）。

ローカル開発は `.dev.vars.example` を `.dev.vars` にコピーして実際の値を入れる
（gitignore 済み）。`npm run check:pii` で実データがコミット対象に混入していないか
毎回確認する。

### 5. 認証の確認

- シークレットウィンドウで `https://sumai-log.saitotakuya0719.workers.dev/` を開く →
  Access のログイン画面 → Google → ホームが出る
- `curl` で JWT なしにアクセスすると Access のログインへ `302` リダイレクトされる
  （Worker のアプリ HTML には直接到達できない）
- 許可外の Google アカウントでは Access が拒否する
- 設定ページで自分の表示名と色が `MEMBERS` どおりに出ることを確認する

### 6. Keyway（secret のチーム共有）

```bash
keyway pull -e development -f .dev.vars -y   # 開発用の実値を取得
```

本番値は `production` 環境に入っている（`ACCESS_ALLOWED_EMAILS` / `MEMBERS` /
`ENVIRONMENT=production`）。Vault: https://app.keyway.sh/vaults/tktk7l9/sumai-log

### 7. Workers Builds（GitHub 連携・ダッシュボード）

Workers & Pages → `sumai-log` → Settings → Build → Connect to GitHub:

- Repository: `tktk7l9/sumai-log` ／ Branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

接続後、空コミットを `main` に push して自動デプロイが動くことを確認する:

```bash
npx wrangler deployments list   # 先頭の Created が push 時刻（UTC）と一致するか確認
```

Workers Builds が無音で止まる既知の事故があるため（他プロジェクトで実例あり）、接続直後は
必ずこの突合をする。ずれていたら手元から `npm run deploy` で応急し、原因を調べる。

**⚠️ この項目は本タスクではダッシュボード操作が必要なため未実施。上記手順どおりに
オーナーが設定すること。**
