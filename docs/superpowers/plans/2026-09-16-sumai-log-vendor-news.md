# 業者のお知らせ取得（vendor news）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 候補 4 社のお知らせ（RSS 3 本＋HTML 1 本）を毎朝 6 時に取得して保存し、ホームの「業者のお知らせ」ブロックと `/news` ページに表示する。見学会などの日程はカレンダーに「情報」レイヤーとして出し、「行く」で自分の予定に変換できる。

**Architecture:** 解析は純粋関数（`src/lib/news/*`、100%）。取得は `src/server/newsFetcher.ts`（`fetchImpl` 注入で worker テスト）。保存は `src/server/repository/news.ts`。Cron は `src/server.ts`（TanStack Start の `createServerEntry` に `scheduled` を追加）＋ `wrangler.jsonc` の `triggers.crons`。画面は既存のパターン（ホームのブロック・PageShell・カレンダーの `renderDay`）を踏襲。

**Tech Stack:** TanStack Start + React 19 + Mantine v9 + Drizzle (D1) + Cloudflare Cron Triggers + vitest 4（node / workers pool）

**Spec:** `docs/superpowers/specs/2026-09-16-vendor-news-design.md`

## Global Constraints

- **PII をコード・テスト・seed・ドキュメント・レポートに書かない**。テストのフィクスチャは架空の RSS/HTML（業者名は「テスト工務店」等。実在の URL を書かない）
- `src/lib/` は純粋関数のみ・100%。`src/server/repository/` は db 引数関数で実 D1 テスト
- 取得先は `vendors.news_url` のみ。1 ソース 10 秒タイムアウト・1 MB 上限・`User-Agent: sumai-log/1.0`。失敗は `news_fetch_error` に残し他ソースは続行
- 保存テキストはタグ除去・`title` 200 字・`summary` 300 字で切る。`dangerouslySetInnerHTML` 禁止。外部リンクは `target="_blank" rel="noopener noreferrer"`
- 変更系 server function は `{ method: 'POST' }`。認証はグローバルミドルウェアのみ。**`scheduled` は認証を通らないが外部入力を受けない**（env の D1 だけ）
- Prettier `semi:false singleQuote:true printWidth:100 trailingComma:'all'`。UI は日本語。新規 npm 依存なし。CSP・`compatibility_date` 不変。下タブ 5 つのまま
- dev server は必ずバックグラウンド起動。Playwright MCP はブラウザ確認に使い、終わりに `browser_close`
- 完了基準: `format:check` `typecheck` `test:coverage`(lib 100%) `test:server` `test:scripts` `build` `check:pii` green、CI green
- git は単純なコマンドを 1 つずつ。ローカル npm は `npx npm@11 install`

---

### Task 1: lib — RSS / HTML リスト / イベント日程の純粋関数

**Files:** Create `src/lib/news/rss.ts` `src/lib/news/rss.test.ts` `src/lib/news/htmlList.ts` `src/lib/news/htmlList.test.ts` `src/lib/news/eventDate.ts` `src/lib/news/eventDate.test.ts` `src/lib/news/text.ts` `src/lib/news/text.test.ts`

**Interfaces:**
- `type NewsCandidate = { url: string; title: string; summary: string | null; publishedOn: string }`（`publishedOn` は `YYYY-MM-DD`）
- `parseRss(xml: string): NewsCandidate[]` — `<item>` ごとに `title`（CDATA/エンティティ解除）・`link`・`pubDate`（RFC 2822 → JST の日付）・`description`（`stripTags` → 300 字）。`link` が `http(s)` でない item は捨てる。壊れた XML は空配列
- `parseHtmlList(html: string, baseUrl: string): NewsCandidate[]` — `<li>` 要素から「YYYY年M月D日」と最初の `<a href>` を取り、`href` は `new URL(href, baseUrl)` で絶対化。日付か href が無い `li` は捨てる。テキストは `stripTags` して日付表記を除いた残りをタイトルに
- `stripTags(html: string): string`（タグ・`<script>`/`<style>` 中身・エンティティ `&amp; &lt; &gt; &quot; &#39; &nbsp;` を解決・空白正規化）／`truncate(text, max)`／`decodeEntities`
- `extractEvent(text: string, publishedOn: string): { start: string; end: string; kind: EventKindLabel } | null`（仕様 §3。`EVENT_KIND_WORDS` の順で最初に一致した語を kind に）／`inferYear(month: number, publishedOn: string): number`

- [ ] Step 1: `text.test.ts` → `text.ts`（RED→GREEN）
- [ ] Step 2: `rss.test.ts`（架空の RSS 3 件: CDATA 題名・エンティティ・`description` に HTML・`pubDate` `Sat, 12 Sep 2026 09:00:00 +0900`・link が `javascript:` の item は落ちる・壊れた XML）→ `rss.ts`
- [ ] Step 3: `htmlList.test.ts`（架空の `<ul><li>2026年9月10日 <a href="./kengaku/x.php">…</a></li>` ×3・日付なし li・相対/絶対 href）→ `htmlList.ts`
- [ ] Step 4: `eventDate.test.ts`（仕様 §3 の例 3 つ＋ `M/D-M/D`・`〜`・`YYYY年M月D日`・年またぎ（投稿 12 月で「1月10日」→翌年）・種別語なし→null・日付なし→null）→ `eventDate.ts`
- [ ] Step 5: `npm run test:coverage` 100% → コミット `feat(lib): お知らせの RSS/HTML 解析とイベント日程抽出`

### Task 2: スキーマ・マイグレーション 0003・repository・seed

**Files:** Modify `src/db/schema.ts`（`vendors` に `newsUrl` `newsSource`（`NEWS_SOURCES = ['rss','html-list']`）`newsFetchedAt` `newsFetchError`；新テーブル `vendorNews` 仕様 §2；`events` は変更しない）；Create `drizzle/migrations/0003_vendor_news.sql`（`npm run db:generate` で生成・journal 更新）、`src/server/repository/news.ts` `src/server/repository/news.worker-test.ts`；Modify `src/server/repository/index.ts`、`src/server/repository/test-helpers.ts`（`vendor_news` を truncate）、`scripts/lib/seed.mjs` と `scripts/import-seed.mjs`（vendors の `newsUrl`/`newsSource` を INSERT に含める）、`scripts/lib/seed.test.mjs`、`src/lib/ids.ts` は不変

**Interfaces:**
- `insertNewsIfNew(db, rows: NewNews[]): Promise<number>`（`url` が既存ならスキップ。戻りは追加件数。`INSERT ... ON CONFLICT(url) DO NOTHING`）
- `listNews(db, opts: { vendorId?: string; limit: number; offset: number }): Promise<(VendorNews & { vendorName: string })[]>`（`published_on desc, first_seen_at desc`）
- `listNewsEventsBetween(db, from: string, to: string): Promise<(VendorNews & { vendorName: string })[]>`（`event_start <= to AND event_end >= from`）
- `listNewsSources(db): Promise<Pick<Vendor,'id'|'name'|'newsUrl'|'newsSource'|'newsFetchedAt'|'newsFetchError'>[]>`（`newsUrl` が非 null の業者）
- `markNewsFetched(db, vendorId: string, error: string | null): Promise<void>`
- `linkPlannedEvent(db, newsId: string, eventId: string): Promise<void>`

- [ ] Step 1: schema → `npm run db:generate` → `npm run db:migrate:local`。生成 SQL を目視（`vendor_news` の UNIQUE(url)・index・FK）
- [ ] Step 2: worker テスト先行（新規のみ追加・一覧の並び・期間検索の境界・fetched/error・link）→ 実装
- [ ] Step 3: seed: `seed.local.json` の vendors 4 社に `newsUrl`/`newsSource` を入れるのは所有者データなので **コードには書かない**。importer が両列を扱えるようにし、`scripts/lib/seed.test.mjs` に架空値のテストを足す。`npm run test:scripts`
- [ ] Step 4: コミット `feat(db): vendor_news テーブルと業者のお知らせ設定列（migration 0003）`

### Task 3: 取得（fetcher）・Cron（scheduled）・server function・設定ページ

**Files:** Create `src/server/newsFetcher.ts` `src/server/newsFetcher.worker-test.ts` `src/server/news.ts` `src/server.ts`；Modify `wrangler.jsonc`（`main: "./src/server.ts"`、`triggers: { crons: ["0 21 * * *"] }`）、`src/routes/settings.tsx`（「業者のお知らせ」カード＋「今すぐ取得」）、`src/components/candidates/VendorForm.tsx`（お知らせ URL・方式の入力。URL は `https://` のみ）

**Interfaces:**
- `fetchVendorNews(db, vendor, fetchImpl = fetch, now = new Date()): Promise<{ added: number; error: string | null }>` — `newsSource` で `parseRss` / `parseHtmlList` を選び、各候補に `extractEvent(title + ' ' + summary, publishedOn)` → `insertNewsIfNew` → `markNewsFetched`。タイムアウトは `AbortSignal.timeout(10_000)`、`content-length` か読み取りサイズで 1 MB 超は中断
- `fetchAllVendorNews(db, fetchImpl?, now?): Promise<{ vendorId: string; added: number; error: string | null }[]>`（`listNewsSources` を順に。1 社の失敗で止めない）
- `src/server.ts`: `createServerEntry({ fetch: <既定ハンドラ>, scheduled: async (_event, env, ctx) => { ctx.waitUntil(fetchAllVendorNews(drizzle(env.DB, { schema }))) } })`。**既定の fetch の取り方は context7 の TanStack Start「Server Entry Point」ガイドで確認**（`createStartHandler(defaultStreamHandler)` か `@tanstack/react-start/server-entry` の default export）。`env.DB` の型は `worker-configuration.d.ts`
- `src/server/news.ts`: `listVendorNews({ vendorId?, limit = 50, offset = 0 })`／`newsEventsForMonth({ ym })`（`from = ym-01`, `to = 月末`）／`fetchNewsNow()`（POST。結果の配列を返す）／`planVisitFromNews({ newsId })`（POST。仕様 §2 の予定を作り `linkPlannedEvent`。すでに紐づいていればその eventId を返す）／`newsSources()`

- [ ] Step 1: `newsFetcher.worker-test.ts`（fetchImpl 差し替え: RSS 成功で added=n・2 回目は 0・HTML 成功・非 200→error・タイムアウト→error・1 MB 超→error・1 社失敗でも次へ）→ 実装
- [ ] Step 2: `src/server.ts` と `wrangler.jsonc`。`npm run build` が通り、`npx wrangler dev --test-scheduled`（ビルド後 `dist` を対象。使えなければ vitest workers の `SELF.scheduled` かローカル手動）で `curl "http://localhost:8787/__scheduled?cron=0+21+*+*+*"` → 200。ログに取得件数
- [ ] Step 3: server function と設定ページ・VendorForm。`fetchNewsNow` を設定の「今すぐ取得」から呼び、Notification に「業者名: 追加 n 件 / エラー」を出す
- [ ] Step 4: 全ゲート → コミット `feat(news): 取得処理・Cron・server function・設定の今すぐ取得`

### Task 4: 画面 — ホームのブロック・`/news`・カレンダーの情報レイヤー・「行く」

**Files:** Create `src/components/news/{NewsList,NewsRow,EventBadge}.tsx` `src/routes/news.tsx`；Modify `src/routes/index.tsx`（「業者のお知らせ」ブロック＝最新 5 件、`listVendorNews({ limit: 5 })`）、`src/components/AppLayout.tsx`（ヘッダに「お知らせ」`Newspaper` リンク。用語集リンクの隣）、`src/routes/calendar.tsx`（loader に `newsEventsForMonth`、`renderDay` に情報用の枠ドット、日別リストに「情報」行＋「行く」）、`src/routeTree.gen.ts`

**Interfaces:**
- `NewsRow({ item, onPlan?: (id) => void })`: `formatDateWithWeekday(publishedOn)` 見出しは親（`groupBy` 日付）・行＝`業者名「タイトル」`（タイトルが外部リンク）＋ `EventBadge`（`見学会 9/12(土)` / `9/12(土)〜9/13(日)`）＋ イベントなら「行く」Button（`planned_event_id` があれば「予定を見る」→ `/calendar?m=&d=`）
- `/news`: `PageShell title="業者のお知らせ"`、業者 Chip.Group（`?v=`）、50 件ずつ「もっと見る」（`?p=`）、`EmptyState`「まだお知らせはありません」
- カレンダー: 情報のドットは `Indicator` を 2 つ重ねず、`renderDay` 内で自分の予定ドット（塗り clay）と情報ドット（`variant="outline"` 相当＝枠だけ・gray）を横並びの小さな `<span>` で描く（Mantine `Indicator` は 1 つのまま、情報は自前の 6px 円）。日別リストは既存の予定の下に「情報」バッジ（gray, variant light）＋業者名＋タイトル（外部リンク）＋「行く」
- 「行く」→ `planVisitFromNews` → Notification「予定を追加しました」→ その日の `/calendar` へ

- [ ] Step 1: NewsRow/NewsList/EventBadge → ホームのブロック → `/news`
- [ ] Step 2: カレンダーの情報レイヤーと「行く」
- [ ] Step 3: 動作確認（Playwright 390×844: ローカルで「今すぐ取得」を押して実サイトから取得 → ホームに 5 件・`/news` に全件・業者で絞り込み・カレンダーで見学会の日に枠ドット・日別リストに「情報」行・「行く」で予定化→塗りドットに変わり「予定を見る」に変わる。スクリーンショットは `.playwright-mcp/`）
- [ ] Step 4: 全ゲート → コミット `feat(news): ホームのお知らせ・/news・カレンダーの情報レイヤーと「行く」`

### Task 5: ドキュメントと所有者向け SQL

**Files:** Modify `README.md`（機能一覧・所有者の作業に「migration 0003 の適用」「vendors-news.sql の適用」「翌朝の取得確認」）、`AGENTS.md`（`src/lib/news`・`src/server.ts` の scheduled・Cron の説明）、`docs/superpowers/specs/2026-09-15-sumai-log-design.md`（§ にお知らせ取得を追記・vendor-news 仕様へのリンク）

- [ ] Step 1: ドキュメント更新 → 全ゲート → コミット `docs: 業者のお知らせ取得の README/AGENTS/仕様`
- [ ] Step 2（コントローラ）: seed の 4 社に `newsUrl`/`newsSource` を入れて `import:seed -- --remote --dry-run` から `UPDATE vendors SET news_url=…, news_source=… WHERE id=…` 4 文を `seed.local/out/vendors-news.sql` に用意（所有者が実行）

## Self-review
- 仕様 §1 取得元/方式 → T1/T3、§2 データ → T2、§3 抽出 → T1、§4 画面 → T4、§5 制約 → Global Constraints/T3、§6 所有者作業 → T5
- 型: `NewsCandidate`（T1）→ fetcher（T3）；`VendorNews & { vendorName }`（T2）→ server fn（T3）→ 画面（T4）；`extractEvent` の戻り `{ start, end, kind }` → `event_start/end/kind`
- `scheduled` の配線は T3 Step 2 で実機確認（TanStack Start の server entry ガイド）
