# sumai-log — エージェント向け指示

夫婦二人だけが使う住まい検討の記録アプリ。**リポジトリは public**、データは D1 / R2 にしか無い。

## 絶対に守ること

1. **PII をコミットしない。** 二人のメール・表示名・見学先の実データ・住所・座標を
   コード／テスト／seed／コメント／ドキュメントに書かない。テストは `owner@example.com` `甲` `乙`
   `テスト市` などの架空値。コミット前に `npm run check:pii`（照合元は gitignore 済みの `.dev.vars`）。
   ただし `check:pii` が知っているのは `.dev.vars` の `ACCESS_ALLOWED_EMAILS`/`MEMBERS`
   （メールと表示名）だけ。業者名・住所・座標などの実データはここでは検出できないので、
   コミット前に人の目で確認する。
2. **R2 バケットを公開設定にしない。** 配信は必ず認証後に Worker 経由でストリームする。
3. **認証を迂回できる経路を足さない。** 判定は `src/lib/access.ts` に集約し、
   `src/start.ts` のグローバルミドルウェアで全リクエストに適用する。fail closed。
   例外: 静的アセット（クライアントバンドル・favicon・manifest・robots.txt）は Workers Assets
   層が配信し `src/start.ts` を経由しない。Cloudflare Access の背後ではあるが、アプリ側
   allowlist は通らない。写真のアップロード（`POST /api/photos`）と配信
   （`GET /api/photos/<key>`）はこの例外に乗せず、`src/routes/api.photos.$.tsx` の
   TanStack Start server route（＝ミドルウェアを通る経路）として実装している。この 2 つは
   `api.photos.tsx`（完全一致）と `api.photos.$.tsx`（スプラット）に分けず、必ず 1 ファイル
   にまとめること。このバージョンの TanStack Router はスプラット `$` を「0 文字にもマッチ
   しうる」ものとして扱い、一致度が同点のとき子ノード（スプラット）を親の完全一致ノードより
   優先するため、分けると `POST /api/photos` がスプラット側の GET ハンドラ（実装なし）に化けて
   SSR フォールバックの 200 HTML に流れ、アップロードが無言で失敗する（実機で確認済み）。
4. **秘密は `.dev.vars`（ローカル）と `wrangler secret`（本番）だけ。** `wrangler.jsonc` の `vars` に
   メールを書かない。Keyway は `keyway pull -e development -f .dev.vars -y`（`keyway run` は wrangler に効かない）。
5. **`src/lib/` は純粋関数のみ。** カバレッジ 100% ゲートの対象。

## 設計の約束

- 副作用は `src/server/`、DB は `src/db/`、UI は `src/components/` と `src/routes/`
- D1 アクセスは `src/server/repository/<domain>.ts`（candidates/places/events/visits/photos/
  comments/settings/geocode/videos/tags/feed）にテーブル単位で分割。`src/server/repository.ts` は
  `export * from './repository/index'` の再エクスポートのみで、既存の import パスは変えずに済む
- 変更系 server function の wrapper（`createServerFn` で `getRequest` などを静的 import するもの）は
  TanStack Start の Vite プラグインが用意する仮想モジュールに依存するため、素の workers テスト
  （`vitest.workers.config.ts`、TanStack の Vite プラグイン無し）から import すると解決に失敗する。
  D1 も要らない純粋な zod スキーマは `src/server/events.schema.ts` のように別ファイルへ切り出し、
  `*.worker-test.ts` はそちらを直接 import してスキーマだけをテストする（`src/server/events.ts` は
  同じ名前を re-export するだけで、公開 import パスは変えない）
- 写真アップロード途中で失敗したときの R2 掃除は `src/server/storage.ts` の `cleanupFailedUpload`
- 日付は TEXT の ISO-8601、金額は円の整数、面積は小数、id は text（`crypto.randomUUID()`）
- スマホ優先。下タブ＋FAB＋全画面 Drawer。デスクトップは左ナビ
- 地図に出せない場所は「出せない理由」を画面に書く（空の枠を出さない）
- 写真は端末で縮小してから送る（表示用 1600px・サムネ 400px の JPEG）。R2 は非公開バケットで、
  配信は認証後に Worker 経由でストリームする。扱ってよいキーは `src/lib/photos.ts` の
  `isManagedPhotoKey` を通ったものだけ
- 予定の日時（`startsAt`）は終日なら `YYYY-MM-DD`、時刻ありなら `YYYY-MM-DDTHH:MM:00+09:00`
  （日本時間のオフセットを明示）。日付キーは先頭 10 文字（`src/lib/calendar.ts`）。Date
  オブジェクトへ変換しない
- `normalizeAddress`（住所の表記ゆれ吸収）と `normalizeSocialUrls`（SNS URL の正規化）は
  `src/lib/`（`geocode.ts` / `social.ts`）と `scripts/lib/normalize.mjs`（`seed.mjs` が
  import して使う）の両方に同じ実装がある。片方だけ変えない（seed 側は plain `.mjs` で
  TS を import できないため、あえて重複させている）。一致は `src/lib/normalize-parity.test.ts`
  が両実装に同じケースを流して固定している。直すときは両方直してこのテストを green に保つ
- 見た目のトークンは `src/theme.ts`（Mantine テーマ・配色）と `src/styles.css`（`--sumai-*` の
  CSS 変数）に集約。コントラストは本文 4.5:1・UI 部品（ボーダー等）3:1 を満たすこと
- 業者のお知らせ取得（`src/lib/news/`）は純粋関数のみ: `rss.ts`（RSS 2.0 の `<item>` 抽出）・
  `htmlList.ts`（`<li>` お知らせ一覧の抽出）・`eventDate.ts`（タイトル/要約からイベント日程を
  抽出）・`text.ts`（タグ除去・長さ制限）に加えて、`url.ts`（取得してよい URL かの判定。https
  限定・ユーザー情報や非既定ポートを拒否・ローカル/内部ホストやリテラル IP を拒否。Workers の
  `fetch` はそもそもプライベートネットワークへ経路を持たないため多層防御の一つ）と
  `charset.ts`（`Content-Type` の `charset` → 本文先頭 2KB の `<meta charset>` sniff → 既定
  `utf-8` の順で文字コードを判定。html-list の古いサイトは Shift_JIS 等を返しうる）
- 実際に fetch するのは `src/server/newsFetcher.ts`。1 ソースあたり 10 秒タイムアウト
  （`AbortSignal.timeout`）・1 MB 上限（`content-length` があれば先に弾き、無ければストリームを
  数えながら超過時点で打ち切る）。業者ごとに try/catch で独立させ、1 社の失敗（想定内のエラーも
  想定外の例外も）が他の業者の取得を止めない。取得結果の記録
  （`src/server/repository/news.ts` の `markNewsFetched`）は成功/失敗どちらでも
  `vendors.news_fetched_at`/`news_fetch_error` だけを更新し、**`vendors.updated_at` は
  動かさない**（動かすと毎朝の自動取得のたびにホームの「最近の更新」フィードへ業者が
  浮上してしまうため）
- `src/server.ts` が Worker の自前エントリ（`wrangler.jsonc` の `main` はここを指す。
  TanStack Start 既定の `@tanstack/react-start/server-entry` を `main` から直接指す構成では
  ない）。`createServerEntry({ fetch: createStartHandler(defaultStreamHandler) })` の結果を
  スプレッドして `fetch` はそのまま使い、`scheduled` だけを足して Cron
  （`wrangler.jsonc` の `triggers.crons` = `"0 21 * * *"` = 06:00 JST）から
  `fetchAllVendorNews` を呼ぶ。`scheduled` は `ctx.waitUntil` の中で実行し、その中で拾い
  切れなかった例外も外へは投げない（投げても誰も拾わない）
- `wrangler.jsonc` の `routes`（カスタムドメイン `sumai-log.app`）は、所有者がダッシュボードで
  アタッチした実体を設定ファイル側にも反映したもの（ダッシュボードでの操作が先、設定ファイルは
  後追いで正本を揃える）。`main`・`triggers`・`routes` のいずれかを変えたら `npm run build` の
  後に `dist/server/wrangler.json` で反映されているか確認する
- 本番 D1 への一回きりの書き込み（初期データ投入・業者の代表者名やお知らせ URL の設定など）は
  Claude からは実行しない（本番書き込みは通らない）。SQL ファイルを `seed.local/out/`
  （gitignore 済み。コミットしない）に用意し、所有者が
  `npx wrangler d1 execute sumai-log --remote --file <path> -y` で実行する

## スキーマを変えたら

```bash
npm run db:generate
npm run db:migrate:local
npm run cf-typegen   # バインディングや vars を増やしたとき
```

## 完了の基準

`npm run format:check` `typecheck` `test:coverage` `test:server` `build` `check:pii` がすべて green。
認証に触れたら拒否側（JWT なし／署名不正／allowlist 外／本番での dev 経路）で 403 を確認する。

## 参照

仕様: `docs/superpowers/specs/2026-09-15-sumai-log-design.md`
業者のお知らせ取得の仕様: `docs/superpowers/specs/2026-09-16-vendor-news-design.md`
