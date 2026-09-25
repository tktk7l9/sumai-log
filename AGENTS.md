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
- スマホ優先。下タブ＋FAB＋全画面 Drawer。デスクトップは左ナビ。スマホのヘッダは「お知らせ」と
  「…（その他）」の 2 つだけで、下タブに無い残りのページは `AppLayout.tsx` の `MoreMenu`（名前付き）に
  入れる（無ラベルのアイコンを並べない）。詳細ページは `PageShell` の `back` に `BackButton` を渡して
  親ページ（候補・記録・地図・用語集＝名詞）へ戻れるようにする。追加ボタン（FAB）の文言は
  「〜を追加」「記録を書く」のように対象＋動詞で揃える。未登録の値は「—」を出さず行ごと消す
  （SHIG 6・37・47・59・60。2026-09-25 の全体見直し）
- 地図に出せない場所は「出せない理由」を画面に書く（空の枠を出さない）
- 写真は端末で縮小してから送る（表示用 1600px・サムネ 400px の JPEG）。R2 は非公開バケットで、
  配信は認証後に Worker 経由でストリームする。扱ってよいキーは `src/lib/photos.ts` の
  `isManagedPhotoKey` を通ったものだけ
- 業者画像（代表者の顔写真・ファビコン）の R2 キーは `vendors/{id}/…-{stamp}` の形でバージョン
  を持たせる（`{stamp}` は差し替えるたびに変わる値）。見学写真（`photos/{visitId}/{photoId}-…`）
  と違って業者側のキーは元々 `vendorId` だけから決定的だったため、差し替え後も同じ URL を
  `cache-control: immutable` で長期キャッシュしてしまい、再アップロードしても古い画像が
  出続ける不具合があった（鍵にバージョンを持たせることで解決する）
- `vendors.favicon_source`（`'auto' | 'manual'`。既存行との後方互換のため nullable で、null は
  `'auto'` 扱い）は favicon_key の由来を持つ。業者フォームの「サイトのアイコン」から手動
  アップロード（`uploadVendorFaviconCore`）すると `'manual'` になり、以後の非 force の自動
  取得（`refreshAllVendorFavicons` の既定呼び出し・`saveVendor` 保存時のインライン取得）は
  この業者をスキップして上書きしない（Cloudflare からのアクセスを一律拒否するサーバー向けの
  代替経路のため、自動取得に負けさせない）。設定画面の「取り直す」（`force: true`）はこの限り
  でなく、手動アップロードした業者も対象に含める。削除（`deleteVendorFaviconObjects`）は
  `favicon_key`/`favicon_source` を両方 NULL に戻す
- 予定の日時（`startsAt`）は終日なら `YYYY-MM-DD`、時刻ありなら `YYYY-MM-DDTHH:MM:00+09:00`
  （日本時間のオフセットを明示）。日付キーは先頭 10 文字（`src/lib/calendar.ts`）。Date
  オブジェクトへ変換しない
- `normalizeAddress`（住所の表記ゆれ吸収）と `normalizeSocialUrls`（SNS URL の正規化）は
  `src/lib/`（`geocode.ts` / `social.ts`）と `scripts/lib/normalize.mjs`（`seed.mjs` が
  import して使う）の両方に同じ実装がある。片方だけ変えない（seed 側は plain `.mjs` で
  TS を import できないため、あえて重複させている）。一致は `src/lib/normalize-parity.test.ts`
  が両実装に同じケースを流して固定している。直すときは両方直してこのテストを green に保つ
- 業者の調査メモ（`vendors.research`、JSON。形は `src/lib/research.ts` の `VendorResearch`）は
  `saveVendorResearch`（`src/server/research.ts`）だけが書く。業者フォーム（`vendorInput`）は
  この列を持たないので、業者の他の項目を保存しても調査メモは消えない（`upsertVendor` は
  渡されないキーを触らない）。比較表 `/candidates/compare` と業者詳細の「計画に対する目安」は
  設定 `buildPlan`（`src/lib/research.ts` の `BuildPlan`: 階数・坪数レンジ・土地以外の予算）を
  使う。土地の所在や資金の内訳は持たない（design.md §1）。調査内容そのものは実データなので
  リポジトリに書かず、SQL を `seed.local/out/` に用意して所有者が流す（下の「本番 D1 への
  一回きりの書き込み」と同じ）
- 入力の快適さの約束（2026-09-24）: フォームの書きかけは `src/components/useFormDraft.ts` で端末の
  localStorage に残す（鍵は `src/lib/drafts.ts` の `draftKey`。既存の行は開いた時点の updatedAt を
  文脈に入れ、相手の保存後に古い下書きで上書きしない）。閉じるときに確認ダイアログは出さない。
  同時編集は `src/server/repository/stale.ts`: 見学・動画・予定・業者の保存は `expectedUpdatedAt`
  を受け、`WHERE updated_at = ?` で 0 行なら `{ conflict: true }` を返す（上書きしない）。保存
  ボタンは `.form-actions`（Drawer の下端に固定）で包む。Enter で確定する欄は
  `e.nativeEvent.isComposing` を見て、日本語入力の変換確定では動かさない
- 記録の分析（`/analysis`）の集計は `src/lib/analysis.ts`（純粋関数）。`src/server/analysis.ts` が
  D1 から読んで集計まで済ませ、画面には結果だけを返す。外部 API（LLM など）には送らない（所有者の
  選択、2026-09-23）。言葉の区切りは `Intl.Segmenter('ja')`。月ごとのグラフの 2 色は styles.css の
  `--sumai-series-*`（dataviz の検証済み。明暗で別の値）
- 設定ページの「利用者」の「最後に使った日時」は settings テーブルの `lastSeen:<メール>`（ISO 8601。
  キーは `src/lib/usage.ts` の `lastSeenKey`）。`src/start.ts` の認証ミドルウェアが `recordSeen`
  （`src/server/activity.ts`）を呼び、`cloudflare:workers` の `waitUntil` で応答を待たせずに書く。
  同じ人は `SEEN_INTERVAL_MS`（10 分）に 1 回だけ（isolate ごとのメモリで間引く）。Access のログイン
  時刻ではない（セッションは約 1 ヶ月で、ログインの瞬間はアプリから見えない）。「環境」の使用量は
  `src/server/repository/usage.ts`: D1 の大きさはクエリ結果の `meta.size_after`（`PRAGMA page_count`
  は D1 で使えない）、R2 は `list` を最大 10 ページ。建築予定地（`homeAreas`）は画面から変えない
  （読み取り専用。変えるなら `seed.local/out/` の SQL）
- 区画シミュレーター（`/site`）の保存値は設定 `sitePlan`（`src/lib/sitePlan.ts` の `SitePlan`）。
  土地を長方形で近似した寸法・区画・建物・法規の目安の数値だけを持ち、所在地・地番・座標は
  持たない（コード・テスト・コミットメッセージにも書かない）。法規の数値（建ぺい率・容積率・
  境界からの離れ・道路の幅員・準防火の有無・筆界）はすべて画面で変えられる「目安」で、確定値として
  扱わない。判定の前提は神奈川県の県所管区域の住宅（`src/lib/sitePlan.ts` 冒頭のコメント）。
  路地状部分は建築基準法 43 条の 2m だけで、県条例に「長さ 20m 超で 3m」のような上乗せは無い
  （東京都安全条例と混同しない）。実際の土地の寸法・隣地（名前・位置・高さ）は `seed.local/out/`
  の SQL で所有者が流す。日当たりの計算（`src/lib/sun.ts`）は真太陽時で、均時差・経度・大気差は入れない。
  3D 表示は `src/lib/site3d.ts`（シーンの中身・純粋関数）と `src/components/site/SiteView3D.tsx`
  （three.js の描画・値や視点が変わったときだけ描く）。`site.tsx` は `import.meta.env.SSR` のとき
  3D を読み込まない（three.js を Worker のバンドルに入れない。入れると gzip で +250KiB）
- 見た目のトークンは `src/theme.ts`（Mantine テーマ・配色）と `src/styles.css`（`--sumai-*` の
  CSS 変数）に集約。コントラストは本文 4.5:1・UI 部品（ボーダー等）3:1 を満たすこと
- 業者のお知らせ取得（`src/lib/news/`）は純粋関数のみ: `rss.ts`（RSS 2.0 の `<item>` 抽出）・
  `htmlList.ts`（`<li>` お知らせ一覧の抽出）・`eventDate.ts`（タイトル/要約からイベント日程を
  抽出）・`text.ts`（タグ除去・長さ制限）に加えて、`url.ts`（取得してよい URL かの判定。https
  限定・ユーザー情報や非既定ポートを拒否・ローカル/内部ホストやリテラル IP を拒否。Workers の
  `fetch` はそもそもプライベートネットワークへ経路を持たないため多層防御の一つ）と
  `charset.ts`（`Content-Type` の `charset` → 本文先頭 2KB の `<meta charset>` sniff → 既定
  `utf-8` の順で文字コードを判定。html-list の古いサイトは Shift_JIS 等を返しうる）
- 外向き fetch（業者のお知らせ・業者サイトのファビコン/代表者写真・情報源の YouTube
  チャンネルページ取得の 4 経路）は全て `src/server/safeFetch.ts` の
  `fetchWithGuardedRedirects` を経由する。`redirect: 'manual'` で受けた 3xx の `Location` を
  「今いる URL」基準で解決し、hop ごとに `isAllowedRemoteUrl`（`src/lib/news/url.ts`）を
  再判定してから次の hop を fetch する（最大 3 hop。許可されない hop 先には fetch しない）。
  新しく外向き fetch を足すときはここを通すこと（自前で `fetch` を直接呼ばない）
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
