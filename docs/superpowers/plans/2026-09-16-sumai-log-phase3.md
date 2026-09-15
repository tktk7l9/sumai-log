# sumai-log Phase 3（YouTube メモ・ホームのフィード・PWA・デザイン仕上げ・負債回収）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仕様 §7 の Phase 3 を本番に出す: YouTube メモ（URL を貼ると題名/チャンネル/サムネを自動取得・タグ・学び）、ホームの「最近の更新」フィード、PWA（ホーム画面追加）、デザイン仕上げ。あわせて Phase 1/2 で繰り越した負債（repository 分割・テスト不足・重複ロジック）を回収し、Phase 1 で投入済みの動画 5 本が画面で見える状態にする。

**Architecture:** Phase 1/2 の構成を踏襲。純粋関数は `src/lib/`（100%）、DB アクセスは `src/server/repository/*.ts` にドメイン別へ分割（この Phase で分割・挙動不変）、server function は `src/server/*.ts`、oEmbed は Worker 経由のプロキシ `src/routes/api.oembed.tsx`（ホスト allowlist・タイムアウト）。フィードは各ドメインの直近 N 件を取って純粋関数で並べる（UNION SQL を書かない）。PWA は manifest とメタタグの整備（Service Worker は持たない＝オフライン非対応・仕様どおり）。デザインは `frontend-design` スキルでテーマ・カード・余白・写真の見せ方を磨く（機能変更なし）。

**Tech Stack:** TanStack Start + React 19 + Mantine v9（`TagsInput`）+ Drizzle (D1) + R2 + vitest 4（node / workers pool）+ `frontend-design` skill

**Spec:** `docs/superpowers/specs/2026-09-15-sumai-log-design.md`（§2 記録タブ/ホーム、§3 videos/tags/comments、§5 YouTube、§7 Phase 3）

## Global Constraints

- **PII をコード・テスト・seed・コメント・ドキュメント・レポートに書かない**。テストは架空値（`owner@example.com`、`テスト市`）。レポートは件数のみ。公開リポジトリ
- `src/lib/` は純粋関数のみ・100%（「今」は引数で受ける）。`src/server/repository/` は db 引数関数で実 D1 テスト（`npm run test:server`）
- YouTube: 受け付けるホストは `youtube.com` / `www.youtube.com` / `m.youtube.com` / `youtu.be` / `music.youtube.com` のみ。動画 ID は 11 文字 `[A-Za-z0-9_-]`。oEmbed は Worker から `https://www.youtube.com/oembed?url=<正規化URL>&format=json` を取得（キー不要・5 秒タイムアウト・失敗時は題名手入力で保存できる）。サムネは `https://i.ytimg.com/vi/<id>/hqdefault.jpg`（CSP `img-src` に既に含む）。**CSP は変更しない**
- 変更系 server function は `{ method: 'POST' }`。認証はグローバルミドルウェアのみ（`src/start.ts`）
- 日付は ISO TEXT。D1 の `datetime('now')` は UTC。JST 表示は `src/lib/jst.ts` に集約
- Prettier `semi:false singleQuote:true printWidth:100 trailingComma:'all'`。UI は日本語。新規 npm 依存は増やさない。`wrangler.jsonc` の `compatibility_date` は変えない
- 下タブは 5 つのまま。記録タブの SegmentedControl「見学記録 / YouTube」で切替
- **dev server は必ずバックグラウンドで起動**（フォアグラウンド起動はツール呼び出しを塞ぐ）。Playwright MCP が使えるときだけブラウザ確認し、使えないときは render テスト・curl で代替して報告に明記する。スクリーンショットは worktree の `.playwright-mcp/` 配下のみ（gitignore 済・コミットしない）
- 完了基準: `format:check` `typecheck` `test:coverage`(lib 100%) `test:server` `test:scripts` `build` `check:pii` green、PR の CI green
- ローカル npm は `npx npm@11 install`。git は単純なコマンドを 1 つずつ（`&&` 連結やヒアドキュメント入りの git は harness が拒否する）

---

### Task 1: lib — YouTube URL 解析・JST 表示・フィード結合

**Files:** Create `src/lib/youtube.ts` `src/lib/youtube.test.ts` `src/lib/jst.ts` `src/lib/jst.test.ts` `src/lib/feed.ts` `src/lib/feed.test.ts`；Modify `src/components/comments/CommentThread.tsx`（dayjs の UTC+9h 計算を `formatJst` に置換）

**Interfaces（後続タスクが使う名前・型）:**
- `parseYouTubeId(url: string): string | null` — `https://youtu.be/<id>?si=…`、`https://www.youtube.com/watch?v=<id>&t=…`、`/shorts/<id>`、`/embed/<id>`、`/live/<id>`、`m.youtube.com` / `music.youtube.com` を受ける。他ホスト・11 文字でない id・空文字は `null`。前後の空白は trim
- `canonicalYouTubeUrl(id: string): string` → `https://www.youtube.com/watch?v=<id>`
- `youtubeThumbnailUrl(id: string): string` → `https://i.ytimg.com/vi/<id>/hqdefault.jpg`
- `isYouTubeHost(hostname: string): boolean`
- `formatJst(value: string, opts?: { withTime?: boolean }): string` — D1 の `YYYY-MM-DD HH:MM:SS`（UTC）と ISO（`Z` / `+09:00` / オフセットなし=UTC）を受け、JST の `YYYY-MM-DD` または `YYYY-MM-DD HH:mm`（既定 withTime: true）を返す。純粋（`Date.UTC` で計算・`Date.now()` 不使用）。解釈できない文字列はそのまま返す
- `toJstDateKey(value: string): string` — 上と同じ入力から JST の `YYYY-MM-DD`
- `type FeedKind = 'visit' | 'event' | 'vendor' | 'property' | 'place' | 'video' | 'comment' | 'photo'`
- `type FeedItem = { kind: FeedKind; id: string; title: string; subtitle?: string; at: string; by: string; href: { to: string; params?: Record<string, string> } }`（`at` は D1 UTC か ISO、`by` はメール）
- `mergeFeed(groups: readonly (readonly FeedItem[])[], limit: number): FeedItem[]` — `at` を UTC ミリ秒に直して降順、同時刻は `FEED_KIND_ORDER` の順で安定、`limit` 件
- `FEED_KIND_LABEL: Record<FeedKind, string>`（見学記録/予定/業者/物件/場所/動画/コメント/写真）

- [ ] Step 1: `youtube.test.ts` を先に書く（上の 7 形式＋`si`/`t` パラメータ＋`https://example.com/watch?v=abcdefghijk`→null＋10 文字 id→null＋`youtube.com/@channel`→null＋空文字/空白→null＋canonical/thumbnail/isYouTubeHost）→ RED → 実装 → GREEN
- [ ] Step 2: `jst.test.ts`（`2030-01-05 23:30:00`→`2030-01-06 08:30`、`2030-01-05T23:30:00Z`→同、`2030-01-06T08:30:00+09:00`→`2030-01-06 08:30`、`withTime:false`、`toJstDateKey`、不正文字列はそのまま）→ RED → 実装 → GREEN
- [ ] Step 3: `feed.test.ts`（並び・同時刻の kind 順・limit・空・入力を変更しない）→ RED → 実装 → GREEN
- [ ] Step 4: `CommentThread.tsx` の時刻表示を `formatJst(comment.createdAt)` に置換（表示結果は同じ）。`npm run test:coverage` 100%、`typecheck`、`format:check`
- [ ] Step 5: コミット `feat(lib): YouTube URL 解析・JST 表示・フィード結合`

### Task 2: repository をドメイン別に分割（挙動不変）

**Files:** Create `src/server/repository/{index,candidates,places,events,visits,photos,comments,settings,geocode,test-helpers}.ts` と対応する `*.worker-test.ts`；Modify `src/server/repository.ts` を `export * from './repository/index'` の 1 行に；Move `src/server/repository.worker-test.ts` の内容をドメイン別ファイルへ（`reset()` は `test-helpers.ts` に共通化）

- [ ] Step 1: 分割前に `npm run test:server` と `typecheck` を実行して結果（件数）を控える
- [ ] Step 2: 関数を 1 つも変えずにファイルへ移す（import パスの調整のみ）。呼び出し側（`src/server/*.ts`、`src/routes/*`）の import は `../server/repository` のまま動くこと
- [ ] Step 3: `npm run test:server`（同じ件数で PASS）、`typecheck`、`build`。`git diff --stat` で `src/server/repository/*` 以外の差分が `repository.ts` の 1 行化とテストファイルの移動だけであることを確認
- [ ] Step 4: AGENTS.md の「サーバー」節に `src/server/repository/<domain>.ts` の説明を 1 行追加
- [ ] Step 5: コミット `refactor(server): repository をドメイン別に分割`

### Task 3: server — videos / tags / feed の repository と server function、oEmbed プロキシ

**Files:** Create `src/server/repository/{videos,tags,feed}.ts`（+ `*.worker-test.ts`）`src/server/videos.ts` `src/server/tags.ts` `src/server/feed.ts` `src/server/oembed.ts` `src/server/oembed.worker-test.ts` `src/routes/api.oembed.tsx`；Modify `src/server/repository/index.ts`（re-export 追加）

**Interfaces:**
- repository/videos: `upsertVideo(db, input: VideoInput & { id?: string }, actor: string): Promise<string>`（id 生成は `crypto.randomUUID()`、`createdBy` は新規時のみ）／`deleteVideoCascade(db, id: string): Promise<void>`（`comments` の `targetType='video'` も消す）／`listVideosWithLinks(db): Promise<(Video & { vendorName: string | null })[]>`（`watchedOn desc, createdAt desc`）／`getVideoDetail(db, id): Promise<{ video: Video; vendor: { id: string; name: string } | null } | null>`
- repository/tags: `listTags(db): Promise<Tag[]>`（`sortOrder, name`）／`ensureTags(db, names: string[]): Promise<void>`（無い名前だけ末尾 `sortOrder` で追加）／`replaceTags(db, names: string[]): Promise<void>`（並び＝配列順で全置換）／`seedDefaultTags(db): Promise<void>`（0 件のときだけ `DEFAULT_TAGS` を投入・冪等）。`DEFAULT_TAGS` は仕様 §3: 断熱・気密・耐震・間取り・資金・ローン・土地・マンション・管理・設備・外構
- repository/feed: `recentVisits(db, n)` `recentEvents(db, n)` `recentVendors(db, n)` `recentProperties(db, n)` `recentPlaces(db, n)` `recentVideos(db, n)` `recentComments(db, n)` `recentPhotos(db, n)` — 各 `updatedAt`（photos/comments は `createdAt`）降順 n 件、`FeedItem` に必要な列だけ（コメントは対象の名前を JOIN して `subtitle` に。対象が無ければ「（削除済み）」）
- `src/server/oembed.ts`: `fetchYouTubeOEmbed(videoId: string, fetchImpl: typeof fetch = fetch): Promise<{ title: string; channel: string | null; thumbnailUrl: string } | null>`（5 秒 `AbortSignal.timeout`、非 200・JSON 不正・例外は `null`、`thumbnail_url` が無ければ `youtubeThumbnailUrl(id)`）
- `GET /api/oembed?url=<encoded>` → `200 { videoId, title, channel, thumbnailUrl, canonicalUrl }` / `400 { error: 'YouTube の URL を入れてください' }`（ホスト外・id 不正・`url` なし）/ `404 { error: '自動取得できませんでした' }`。`Cache-Control: private, max-age=86400`
- `src/server/videos.ts`（zod は `src/server/zod.ts` のヘルパを使う）: `videoInput = { id?: idField, url: z.string().trim().max(500), title: z.string().trim().min(1).max(300), channel: optionalText(200), thumbnailUrl: optionalUrl, watchedOn: dateField.nullable(), watchedBy: ATTENDEES, tags: z.array(z.string().trim().min(1).max(30)).max(10), takeaways: optionalText(4000), vendorId: idField.nullable() }` → `.transform` で `videoId = parseYouTubeId(url)`（null なら `ctx.addIssue`「YouTube の URL を入れてください」）と `url = canonicalYouTubeUrl(videoId)`／`listVideos()`／`getVideo({ id })`（comments は route 側で `listComments`）／`saveVideo(input)`（`ensureTags` → `upsertVideo`、POST）／`deleteVideo({ id })`（POST）／`videoFormOptions()` → `{ tags: string[]; vendors: { id: string; name: string }[] }`
- `src/server/tags.ts`: `listTagNames()`／`saveTags({ names: string[] })`（POST・`replaceTags`）
- `src/server/feed.ts`: `recentFeed({ limit = 20 })` → `FeedItem[]`（各 recent* を `Promise.all` で 10 件ずつ → `mergeFeed`）

- [ ] Step 1: videos/tags/feed の worker テストを先に書く（RED）→ 実装 → PASS。`seedDefaultTags` は 2 回呼んでも 11 件
- [ ] Step 2: `oembed.worker-test.ts`（`fetchImpl` 差し替え: 200 / 非 200 / 例外 / `thumbnail_url` 欠落 / 5 秒超）
- [ ] Step 3: `api.oembed.tsx`。ローカルで `curl 'http://localhost:3000/api/oembed?url='`→400、`?url=https%3A%2F%2Fexample.com%2Fx`→400、`?url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ`→200（YouTube を 1 回だけ実際に叩く。dev server はバックグラウンド起動）
- [ ] Step 4: 全ゲート → コミット `feat(server): 動画・タグ・フィードの repository / server function と oEmbed プロキシ`

### Task 4: YouTube メモ UI（一覧・フォーム・詳細）と記録タブの切替

**Files:** Create `src/components/videos/{VideoCard,VideoForm,VideoDetail}.tsx` `src/routes/records_.videos.$id.tsx`；Modify `src/routes/records.tsx`（SegmentedControl「見学記録 / YouTube」、`?tab=visits|videos`、FAB メニュー「YouTube」→ VideoForm Drawer）、`src/routeTree.gen.ts`（再生成をコミット）

**Interfaces:**
- `VideoCard({ video })`: サムネ（16:9・`loading="lazy"`・`alt={title}`）・題名 2 行省略・チャンネル・観た日（`formatJst(watchedOn, { withTime: false })`）・観た人（MemberChip）・タグ Badge 群。カード全体を `<Link to="/records/videos/$id">` で包む（`Card component={Link}` は使わない）
- `VideoForm({ initial?, options, onSaved, onCancel })`: URL 欄（blur / 貼り付けで `fetch('/api/oembed?url=…')`。成功なら題名/チャンネル/サムネを自動入力＋Notification「取得しました」、失敗なら Alert「自動取得できませんでした。題名を入力してください」、ホスト外は入力欄を error 表示）／題名／チャンネル／観た日（DateInput）／観た人（SegmentedControl: 二人/夫/妻）／タグ（`TagsInput` `data={options.tags}`・新規追加可・最大 10）／業者（Select・任意）／学び（Textarea autosize）。取得状態は `'idle'|'loading'|'ok'|'fail'`、同じ URL は再取得しない、ユーザーが題名を編集済みなら上書きしない（dirty フラグ）。保存は `saveVideo`
- `VideoDetail`: サムネ大＋「YouTube で開く」（`target="_blank" rel="noopener noreferrer"`）・メタ・学び（改行保持）・関連業者リンク・`CommentThread targetType="video"`・編集（Drawer）/削除（Modal 確認 → `deleteVideo` → `/records?tab=videos`）
- `records.tsx`: `validateSearch` に `tab: z.enum(['visits','videos']).optional()`；loader は `Promise.all([listVisits, listVideos, videoFormOptions])`；videos で 0 件なら `EmptyState`「観た動画のメモを残しましょう」。SegmentedControl の切替は `navigate({ search, replace: true })`

- [ ] Step 1: records.tsx の loader/検索パラメータ/切替 → `typecheck`
- [ ] Step 2: VideoCard / VideoForm / VideoDetail / 詳細ルート
- [ ] Step 3: 動作確認（Playwright MCP が使えれば 390×844: 記録→YouTube 切替で seed の 5 本がサムネ付きで並ぶ／FAB→YouTube→URL 貼り付け→自動取得→保存→一覧に増える／詳細→コメント→削除。使えなければ `curl` で `/records?tab=videos` の SSR HTML に 5 本の題名が含まれることと、フォームの zod を worker テストで確認し報告に明記）
- [ ] Step 4: 全ゲート → コミット `feat(records): YouTube メモの一覧・フォーム・詳細`

### Task 5: ホームの「最近の更新」フィードと設定のタグ編集

**Files:** Create `src/components/home/RecentFeed.tsx`；Modify `src/routes/index.tsx`（UpcomingEvents / PendingVisits の下に RecentFeed・loader に `recentFeed`）、`src/routes/settings.tsx`（タグの `TagsInput` 1 つで並び＝入力順・保存で `saveTags`・「動画側のタグは残ります」注記）

**Interfaces:** `RecentFeed({ items: FeedItem[]; members: Member[] })` — 種別アイコン（lucide: visit=Camera, event=CalendarDays, vendor=Building2, property=Building, place=MapPin, video=Youtube, comment=MessageSquare, photo=Image）・タイトル・副題・「誰が（表示名・色）・いつ（`formatJst`）」・行全体が `href` へのリンク。空なら `EmptyState`「まだ更新がありません」

- [ ] Step 1: `feed.worker-test.ts` は Task 3 で済み。ここでは `index.tsx` の loader に組み込み、`RecentFeed` を作る
- [ ] Step 2: settings のタグ編集（`listTagNames` → `TagsInput` → `saveTags`）。保存後 Notification
- [ ] Step 3: 動作確認（Playwright が使えれば 390×844 と 1280 でホーム 3 ブロック／設定でタグ追加→保存→動画フォームの候補に出る。使えなければ curl の SSR HTML で「最近の更新」見出しと項目数を確認）
- [ ] Step 4: 全ゲート → コミット `feat(home): 最近の更新フィードとタグ設定`

### Task 6: PWA（ホーム画面追加）とメタ情報

**Files:** Modify `public/manifest.json`（`name`「住まいログ」`short_name`「住まいログ」`display: standalone` `start_url: /` `scope: /` `theme_color` `background_color` はテーマの地色・`icons` 192/512 PNG）、Create `public/icons/icon-192.png` `public/icons/icon-512.png`（既存の「住」SVG から `sips` か Canvas で生成・各 20KB 以下・maskable は持たない）、Modify `src/routes/__root.tsx`（`<link rel="manifest">` `<link rel="apple-touch-icon" href="/icons/icon-192.png">` `apple-mobile-web-app-capable` `apple-mobile-web-app-status-bar-style=default` `<meta name="theme-color">` をライト/ダークの `media` 付きで 2 本、viewport に `viewport-fit=cover`）、`src/components/AppLayout.tsx`（下タブと FAB に `env(safe-area-inset-bottom)` の余白）、README §4（「スマホのホーム画面に追加」手順を所有者作業に）

- [ ] Step 1: `src/lib/securityHeaders.ts` の CSP で `manifest-src` が既定（`default-src 'self'`）で許可されることを確認（無ければ `manifest-src 'self'` を追加＝**唯一許される CSP 変更**）
- [ ] Step 2: `curl -sI http://localhost:3000/manifest.json` が 200 / `application/manifest+json` か `application/json`、`/icons/icon-192.png` が 200。`npm run build` の出力に `manifest.json` と icons が含まれる
- [ ] Step 3: コミット `feat(pwa): ホーム画面追加のための manifest・アイコン・セーフエリア`

### Task 7: デザイン仕上げ（frontend-design）

**Files:** Modify `src/theme.ts` `src/styles.css` `src/components/AppLayout.tsx` `src/components/{PageShell,EmptyState,Fab,MemberChip}.tsx`、各 Card（`candidates/VendorCard` `candidates/PropertyCard` `visits/VisitCard` `videos/VideoCard` `calendar/EventItem`）、`src/routes/index.tsx`

**方針（`frontend-design` スキルを読んでから着手・機能変更なし）:** 暖色の中立パレット（地 `#faf7f2` 系・文字 `#2b2420` 系・線 `#e8e0d6` 系・ダークは `#1c1917` 基調）＋既存の `clay` をアクセントに維持。カードは角丸 `md`・影なし＋1px 線・写真は角丸内 `object-fit: cover`（見学 4:3・動画 16:9）。作成者は MemberChip（丸＋イニシャル）とカード左端 3px の色帯。余白はモバイル左右 16px・カード間 12px・セクション間 24px・下タブ 56px＋セーフエリア。空状態は絵文字 1 つ＋一文＋主ボタン。フォントは system-ui スタック（外部フォントは CSP 上使わない）。コントラスト 4.5:1 以上。**ルーティング・server function・lib は触らない**

- [ ] Step 1: `frontend-design` スキルを読み、上の方針で theme と主要コンポーネントを更新。`typecheck` と全テストの件数が変わらないこと
- [ ] Step 2: 動作確認（Playwright が使えれば 390×844 で 5 タブ＋詳細 3 種＋フォーム 2 種、ダークも 5 タブ、`.playwright-mcp/` に前後比較。使えなければ `npm run build` と SSR HTML の目視代替＝クラス名/スタイルの差分をレポートに）
- [ ] Step 3: コミット `style: 暖色パレット・カード・余白のデザイン仕上げ`

### Task 8: 繰り越し負債の回収

**Files:** Modify `src/server/events.worker-test.ts`（`eventInput` の parse: 終日/時刻あり/終了<開始 reject）、`src/server/visits.worker-test.ts`（写真アップロード途中失敗時の R2 掃除 `catch`: `deleteMany` が throw しても元エラーが返る）；Create `src/lib/prefill.ts` `src/lib/prefill.test.ts`（`buildVisitPrefill(search: { placeId?: string; eventId?: string }, event: { placeId: string | null; vendorId: string | null; startsAt: string } | null): Partial<VisitFormValues>` を `src/routes/records.tsx` から切り出し・`?? undefined` で null 既定を上書きしないことをテストで固定）、`scripts/lib/normalize.mjs`（`normalizeAddress` と `normalizeSocialUrls` を `scripts/lib/seed.mjs` から移動）、`src/lib/normalize-parity.test.ts`（同じ 12 ケースを `src/lib/geocode.ts` / `src/lib/social.ts` と `scripts/lib/normalize.mjs` の両実装に流して一致を検証）；Modify `AGENTS.md`「重複ロジックの同期」節に一致テストの場所を書く

- [ ] Step 1: 各テストを RED → GREEN。`npm run test:coverage` 100%、`test:server`、`test:scripts` green
- [ ] Step 2: コミット `test: 繰り越し負債の回収（eventInput・写真掃除・プリフィル・正規化の一致テスト）`

### Task 9: ドキュメント・本番確認

**Files:** Modify `README.md`（§3 機能一覧に YouTube メモ/最近の更新/PWA/用語集、§4 所有者作業に「ホーム画面追加」「妻の Gmail 追加」「用語集の本番確認 4 点」）、`docs/superpowers/specs/2026-09-15-sumai-log-design.md`（§7 Phase 3 を「実装済み」に・oEmbed の実装メモ）、`AGENTS.md`（repository 分割後のディレクトリ説明が Task 2 で入っていることを確認）

- [ ] Step 1: 全ゲート green・PR を main へ（CI green 確認）
- [ ] Step 2: マージ後 Workers Builds の成功を確認し、本番で `/records?tab=videos`・`/`・`/manifest.json` が（未認証なら 302、認証後は 200 で）応答することを curl で確認。`wrangler deployments list` の Created が main 最新と一致
- [ ] Step 3: `npm run db:export -- --remote` でバックアップ → Drive `backups/sumai-log`

## Self-review
- 仕様 §2 記録タブ（SegmentedControl）→ T4、ホームのフィード → T5、§3 videos/tags → T3、§5 YouTube（oEmbed・ホスト制限・手入力フォールバック）→ T1/T3/T4、§7 Phase 3（PWA・デザイン・バックアップ手順）→ T6/T7/T9、繰り越し負債 → T2/T8
- 型: `FeedKind` 8 種は T1/T3/T5 で同一。`videoInput.tags: string[]` と `TagsInput` の value 型一致。`formatJst` は T1（CommentThread）・T4（VideoCard）・T5（RecentFeed）で共用
- 置き場: `src/server/repository.ts` は 1 行 re-export（既存 import を壊さない）。分割後の新規コード（T3）は `repository/*.ts` に直接書く
