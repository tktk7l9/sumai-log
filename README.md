# sumai-log — 住まいログ

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

Task 10 で追記。
