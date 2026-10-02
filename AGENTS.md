# sumai-log — instructions for agents

A record app for a housing search, used only by one married couple. **The repository is public**; the data exists only in D1 / R2.

## Rules that must never be broken

1. **Do not commit PII.** Do not write the two users' e-mails, display names, real data of visited
   places, addresses or coordinates into code / tests / seed / comments / documentation. Tests use
   fictional values such as `owner@example.com` `甲` `乙` `テスト市`. Run `npm run check:pii` before
   committing (the reference data is `.dev.vars`, which is gitignored).
   However, the only words `check:pii` knows are `ACCESS_ALLOWED_EMAILS`/`MEMBERS` in `.dev.vars`
   (e-mails and display names). Real data such as vendor names and addresses cannot be detected
   here, so check with human eyes before committing.
   Coordinates are detected by shape (`scripts/lib/pii.mjs`): a latitude and longitude inside
   Japan with 5 or more decimal places fails the check, in CI too. A sample coordinate must be
   made up or a public landmark, and listed in `ALLOWED_COORDINATES` with what it is. Coarser
   values pass the check, so do not write a real location at any precision (a real one stayed in
   a comment as a "sample" and the history had to be rewritten, 2026-09-27).
2. **Do not make the R2 bucket public.** Delivery must always be streamed through the Worker after
   authentication.
3. **Do not add a path that can bypass authentication.** The decision is centralised in
   `src/lib/access.ts` and applied to every request by the global middleware in `src/start.ts`.
   Fail closed.
   Exception: static assets (client bundle, favicon, manifest, robots.txt) are served by the
   Workers Assets layer and do not go through `src/start.ts`. They are behind Cloudflare Access,
   but they do not pass the app-side allowlist. Photo upload (`POST /api/photos`) and delivery
   (`GET /api/photos/<key>`) are not put on this exception; they are implemented as a TanStack
   Start server route in `src/routes/api.photos.$.tsx` (= a path that goes through the
   middleware). These 2 must not be split into `api.photos.tsx` (exact match) and
   `api.photos.$.tsx` (splat); always keep them in 1 file. This version of TanStack Router treats
   the splat `$` as something that "can also match 0 characters" and, when the match score is
   tied, prefers the child node (splat) over the parent exact-match node, so when they are split
   `POST /api/photos` turns into the GET handler on the splat side (no implementation), flows
   into the 200 HTML of the SSR fallback, and the upload fails silently (confirmed on a real
   device).
4. **Secrets live only in `.dev.vars` (local) and `wrangler secret` (production).** Do not write
   e-mails into `vars` of `wrangler.jsonc`. For Keyway use
   `keyway pull -e development -f .dev.vars -y` (`keyway run` does not work with wrangler).
5. **`src/lib/` contains pure functions only.** It is the target of the 100% coverage gate.

## Design agreements

- Side effects go in `src/server/`, the DB in `src/db/`, the UI in `src/components/` and `src/routes/`
- D1 access is split per table into `src/server/repository/<domain>.ts` (candidates/places/events/
  visits/photos/comments/settings/geocode/videos/tags/feed). `src/server/repository.ts` is only a
  re-export, `export * from './repository/index'`, so existing import paths do not have to change
- The wrappers of mutating server functions (those that statically import `getRequest` etc. with
  `createServerFn`) depend on the virtual modules provided by the Vite plugin of TanStack Start,
  so importing them from the plain workers tests (`vitest.workers.config.ts`, without the
  TanStack Vite plugin) fails to resolve. Pure zod schemas that do not need D1 either are
  extracted into a separate file like `src/server/events.schema.ts`, and `*.worker-test.ts`
  imports that file directly and tests only the schema (`src/server/events.ts` only re-exports
  the same names, and the public import path does not change)
- The R2 cleanup when a photo upload fails midway is `cleanupFailedUpload` in
  `src/server/storage.ts`
- Dates are TEXT in ISO-8601, amounts are integers in yen, areas are decimals, ids are text
  (`crypto.randomUUID()`)
- Mobile first. Bottom tabs + FAB + full-screen Drawer. Desktop uses a left navigation. The mobile
  header has only 2 items, 「お知らせ」 (vendor news) and 「…（その他）」 (… (More)), and the
  remaining pages that are not in the bottom tabs go into `MoreMenu` (with names) in
  `AppLayout.tsx` (do not line up unlabelled icons). Detail pages pass `BackButton` to `back` of
  `PageShell` so that the user can return to the parent page (「候補」 (Candidates), 「記録」
  (Records), 「地図」 (Map), 「用語集」 (Glossary) = nouns). The wording of the add button (FAB) is
  unified as object + verb, like 「〜を追加」 (Add …) and 「記録を書く」 (Write a record). For a
  value that is not registered, do not show 「—」; remove the whole row
  (SHIG 6, 37, 47, 59, 60. The overall review of 2026-09-25)
- For a place that cannot be shown on the map, write "the reason it cannot be shown" on the screen
  (do not show an empty frame)
- Photos are downscaled on the device before being sent (JPEG, 1600px for display and 400px for
  the thumbnail). R2 is a private bucket, and delivery is streamed through the Worker after
  authentication. The only keys that may be handled are those that passed `isManagedPhotoKey` in
  `src/lib/photos.ts`
- The R2 keys of vendor images (the representative's portrait photo and the favicon) carry a
  version in the form `vendors/{id}/…-{stamp}` (`{stamp}` is a value that changes on every
  replacement). Unlike visit photos (`photos/{visitId}/{photoId}-…`), the vendor-side keys were
  originally deterministic from `vendorId` alone, so the same URL kept being cached for a long
  time with `cache-control: immutable` even after a replacement, and there was a bug where the
  old image kept being shown even after re-uploading (solved by giving the key a version)
- `vendors.favicon_source` (`'auto' | 'manual'`. Nullable for backward compatibility with existing
  rows; null is treated as `'auto'`) holds the origin of favicon_key. A manual upload
  (`uploadVendorFaviconCore`) from 「サイトのアイコン」 (Site icon) in the vendor form makes it
  `'manual'`, and from then on the non-force automatic fetch (the default call of
  `refreshAllVendorFavicons` and the inline fetch on save in `saveVendor`) skips this vendor and
  does not overwrite it (it is the alternative path for servers that uniformly reject access
  from Cloudflare, so it must not lose to the automatic fetch). 「取り直す」 (Fetch again) on the
  settings screen (`force: true`) is not bound by this and also includes vendors with a manual
  upload. Deletion (`deleteVendorFaviconObjects`) sets both `favicon_key`/`favicon_source` back
  to NULL
- The date and time of an event (`startsAt`) is `YYYY-MM-DD` when all-day and
  `YYYY-MM-DDTHH:MM:00+09:00` when it has a time (the offset of Japan time is stated
  explicitly). The date key is the first 10 characters (`src/lib/calendar.ts`). Do not convert to
  a Date object
- `normalizeAddress` (absorbs notation variants of addresses) and `normalizeSocialUrls`
  (normalisation of SNS URLs) have the same implementation in both `src/lib/` (`geocode.ts` /
  `social.ts`) and `scripts/lib/normalize.mjs` (imported and used by `seed.mjs`). Do not change
  only one of them (the seed side is plain `.mjs` and cannot import TS, so the duplication is
  deliberate). The match is pinned by `src/lib/normalize-parity.test.ts`, which runs the same
  cases through both implementations. When fixing, fix both and keep this test green
- The vendor research memo (`vendors.research`, JSON. The shape is `VendorResearch` in
  `src/lib/research.ts`) is written only by `saveVendorResearch` (`src/server/research.ts`). The
  vendor form (`vendorInput`) does not have this column, so saving other fields of the vendor
  does not erase the research memo (`upsertVendor` does not touch keys that are not passed). The
  comparison table `/candidates/compare` and 「計画に対する目安」 (Rough guide against the plan) in
  the vendor detail use the setting `buildPlan` (`BuildPlan` in `src/lib/research.ts`: number of
  floors, floor area range in tsubo, budget excluding land). It does not hold the location of the
  land or the breakdown of the funds (design.md §1). The research content itself is real data, so
  it is not written in the repository; the SQL is prepared in `seed.local/out/` and the owner
  runs it (same as "one-off writes to the production D1" below)
- Agreements on input comfort (2026-09-24): an unfinished form is kept in the localStorage of the
  device by `src/components/useFormDraft.ts` (the key is `draftKey` in `src/lib/drafts.ts`. For
  an existing row, the updatedAt at the time it was opened is put into the context, so that an
  old draft does not overwrite after the other person saved). No confirmation dialog is shown
  when closing. Concurrent editing is `src/server/repository/stale.ts`: saving a visit, video,
  event or vendor receives `expectedUpdatedAt` and returns `{ conflict: true }` when
  `WHERE updated_at = ?` matches 0 rows (it does not overwrite). The save button is wrapped in
  `.form-actions` (fixed to the bottom edge of the Drawer). Fields that confirm with Enter look at
  `e.nativeEvent.isComposing` and do not act on the conversion commit of Japanese input
- The aggregation for the analysis of records (`/analysis`) is `src/lib/analysis.ts` (pure
  functions). `src/server/analysis.ts` reads from D1 and finishes the aggregation, and returns
  only the result to the screen. Nothing is sent to an external API (LLM etc.) (the owner's
  choice, 2026-09-23). Word segmentation is `Intl.Segmenter('ja')`. The 2 colours of the monthly
  chart are `--sumai-series-*` in styles.css (validated with dataviz. Different values for light
  and dark)
- 「最後に使った日時」 (Last used) under 「利用者」 (Users) on the settings page is `lastSeen:<email>`
  in the settings table (ISO 8601. The key is `lastSeenKey` in `src/lib/usage.ts`). The
  authentication middleware in `src/start.ts` calls `recordSeen` (`src/server/activity.ts`) and
  writes with `waitUntil` of `cloudflare:workers` without making the response wait. The same
  person is recorded only once per `SEEN_INTERVAL_MS` (10 minutes) (thinned out with per-isolate
  memory). It is not the login time of Access (the session lasts about 1 month, and the moment of
  login is not visible from the app). The usage under 「環境」 (Environment) is
  `src/server/repository/usage.ts`: the size of D1 is `meta.size_after` of a query result
  (`PRAGMA page_count` cannot be used on D1), and R2 is `list` for at most 10 pages. The planned
  building site (`homeAreas`) is not changed from the screen (read-only. To change it, use SQL in
  `seed.local/out/`)
- The saved value of the site plan simulator (`/site`) is the setting `sitePlan` (`SitePlan` in
  `src/lib/sitePlan.ts`). It holds only the dimensions of the land approximated as a rectangle,
  the plots, the building and the numbers of the regulatory rough guides, and it does not hold
  the location, the lot number or coordinates (do not write them in code, tests or commit
  messages either). The regulatory numbers (building coverage ratio (建ぺい率), floor area ratio
  (容積率), setback from the boundary (境界からの離れ), road width (道路の幅員), whether it is a
  quasi-fire-prevention district (準防火), parcel boundary (筆界)) are all "rough guides" that can be
  changed on the screen, and are not treated as confirmed values. The premise of the judgment is
  a house in the area under the jurisdiction of Kanagawa Prefecture (the comment at the top of
  `src/lib/sitePlan.ts`). The flagpole portion (路地状部分) is only the 2m of Article 43 of the
  Building Standards Act (建築基準法), and the prefectural ordinance (県条例) has no additional
  requirement like "3m when longer than 20m" (do not confuse it with the Tokyo Metropolitan
  Building Safety Ordinance (東京都安全条例)). The actual dimensions of the land and the
  neighbouring lots (name, position, height) are run by the owner with SQL in `seed.local/out/`.
  The sunlight calculation (`src/lib/sun.ts`) uses true solar time (真太陽時) and does not include
  the equation of time (均時差), the longitude or atmospheric refraction (大気差).
  The 3D view is `src/lib/site3d.ts` (the content of the scene, pure functions) and
  `src/components/site/SiteView3D.tsx` (rendering with three.js; draws only when a value or the
  viewpoint changed). `site.tsx` does not load 3D when `import.meta.env.SSR` (do not put
  three.js into the Worker bundle. Putting it in adds +250KiB gzipped)
- Visual tokens are centralised in `src/theme.ts` (Mantine theme and colour scheme) and
  `src/styles.css` (the `--sumai-*` CSS variables). Contrast must satisfy 4.5:1 for body text and
  3:1 for UI parts (borders etc.)
- Vendor news fetching (`src/lib/news/`) is pure functions only: `rss.ts` (extraction of `<item>`
  of RSS 2.0), `htmlList.ts` (extraction of a `<li>` news list), `eventDate.ts` (extraction of
  the event date from the title/summary), `text.ts` (tag removal and length limit), and in
  addition `url.ts` (decides whether a URL may be fetched. https only; rejects user info and
  non-default ports; rejects local/internal hosts and literal IPs. `fetch` of Workers has no
  route to private networks in the first place, so this is one layer of defence in depth) and
  `charset.ts` (decides the character encoding in the order: `charset` of `Content-Type` → sniff
  of `<meta charset>` in the first 2KB of the body → default `utf-8`. Old html-list sites can
  return Shift_JIS etc.)
- Outbound fetch (4 paths: vendor news, the favicon / representative photo of the vendor site,
  and fetching the YouTube channel page of a source) all goes through
  `fetchWithGuardedRedirects` in `src/server/safeFetch.ts`. It resolves the `Location` of a 3xx
  received with `redirect: 'manual'` relative to "the current URL", and re-evaluates
  `isAllowedRemoteUrl` (`src/lib/news/url.ts`) for every hop before fetching the next hop (at
  most 3 hops. It does not fetch a hop destination that is not allowed).
  When adding a new outbound fetch, route it through here (do not call `fetch` directly yourself)
- What actually fetches is `src/server/newsFetcher.ts`. A 10 second timeout per source
  (`AbortSignal.timeout`) and a 1 MB limit (when `content-length` exists it is rejected up
  front; when it does not, the stream is counted and cut off at the moment it exceeds). Each
  vendor is made independent with try/catch, and the failure of 1 vendor (expected errors as well
  as unexpected exceptions) does not stop the fetch for other vendors. Recording the fetch result
  (`markNewsFetched` in `src/server/repository/news.ts`) updates only
  `vendors.news_fetched_at`/`news_fetch_error` on both success and failure, and **does not move
  `vendors.updated_at`** (moving it would make the vendor surface in the 「最近の更新」 (Recent
  updates) feed on the home screen on every automatic fetch each morning)
- `src/server.ts` is the Worker's own entry (`main` in `wrangler.jsonc` points here. It is not a
  configuration where `main` points directly at the TanStack Start default
  `@tanstack/react-start/server-entry`). The result of
  `createServerEntry({ fetch: createStartHandler(defaultStreamHandler) })` is spread, `fetch` is
  used as it is, and only `scheduled` is added, which calls `fetchAllVendorNews` from Cron
  (`triggers.crons` in `wrangler.jsonc` = `"0 21 * * *"` = 06:00 JST). `scheduled` runs inside
  `ctx.waitUntil`, and an exception that could not be caught inside it is not thrown to the
  outside either (nobody would catch it even if thrown)
- `routes` in `wrangler.jsonc` (the custom domain `sumai-log.app`) reflects, on the configuration
  file side as well, the entity that the owner attached in the dashboard (the operation in the
  dashboard comes first, and the configuration file follows afterwards to align the source of
  truth). When any of `main`, `triggers` or `routes` is changed, check in
  `dist/server/wrangler.json` after `npm run build` that it is reflected
- One-off writes to the production D1 (initial data load, setting a vendor's representative name
  or news URL, etc.) are not executed from Claude (production writes do not go through). Prepare
  the SQL file in `seed.local/out/` (gitignored. Do not commit it), and the owner executes it with
  `npx wrangler d1 execute sumai-log --remote --file <path> -y`
- Built examples (`/works`, the `works` table) come only from the SQL that
  `npm run import:works` (`scripts/import-works.ts`) writes to `seed.local/out/`; the owner runs
  it. Which sites are read is in `seed.local/works-sites.json` (gitignored), and the parsers are
  named `siteA`/`siteB`/`siteC` (`src/lib/works/`), never after a vendor: vendor names, site
  URLs and example names are real data and are not written in code, tests or commit messages.
  The upsert is keyed by `source_url` and never touches `watched_at`/`watched_by`, nor a video
  pasted by hand (`video_source = 'manual'`); a work whose detail page failed, or parsed to nothing, is left out of
  the SQL instead of being written half-empty, and works removed from a site are not deleted.
  The watched flag is one per work for both users. The tour video plays in a
  `youtube-nocookie.com` iframe without YouTube's script: the page reads the position from
  `postMessage` (`src/lib/works/watch.ts`) and marks the work watched at the end or at 90%. The
  iframe needs `referrerPolicy="strict-origin-when-cross-origin"` because the app-wide
  `referrer-policy: no-referrer` makes YouTube refuse the embed (player error 153), and
  `frame-src` in the CSP allows only that host (spec:
  `docs/superpowers/specs/2026-10-01-works-list-design.md`). `npm run generate-routes` (plain
  `tsr generate`) drops the `@tanstack/react-start` `Register` block at the end of
  `src/routeTree.gen.ts`; after adding a route, let `npm run dev` or `npm run build` regenerate
  the file, or restore that block

## When the schema changed

```bash
npm run db:generate
npm run db:migrate:local
npm run cf-typegen   # when bindings or vars were added
```

## Language

- Code, comments, test titles, log messages and CLI output of scripts are written in English.
- Japanese is used only for text shown to the user in the app (UI strings, messages that reach the screen) and for content under `src/content/`.
- When a comment must name a UI label, quote the Japanese label and add an English gloss.
- Commit messages and PR descriptions follow the existing convention of this repository.

## UI tests

- `src/**/*.ui.test.tsx` run on jsdom with Testing Library (`npm run test:ui`,
  `vitest.ui.config.ts`, with its own coverage gate over `src/components` and `src/routes`).
  Assert what a person sees and does (roles, labels, text, the URL), not snapshots
- Routes are rendered with the real route tree in a memory history (`renderRoute` in
  `test/ui/render.tsx`). `test/ui/setup.ts` turns every `createServerFn` into a `vi.fn()`, so a
  test stubs the server functions its loader and forms call (`stub` in `test/ui/fixtures.ts`)
  and nothing touches D1/R2. The root route is swapped for `test/ui/root.tsx` (same layout,
  without the `<html>` shell)
- Fixtures are fictional (rule 1): `test/ui/fixtures.ts`. Detail routes need UUID-shaped ids
  (`uid(n)`)
- Not run in jsdom, excluded from the gate: `PlacesMap.tsx` (Google Maps), `SiteView3D.tsx`
  (WebGL) and `__root.tsx` (document shell). Pages that use the first two are tested with the
  stand-ins `test/ui/mapStub.tsx` and `test/ui/site3dStub.tsx`
- A delete waiting for its undo window is sent at once with `flushPendingDeletes()` (the same
  `pagehide` path the app uses when the tab closes)

## Completion criteria

`npm run format:check` `typecheck` `test:coverage` `test:server` `test:ui` `build` `check:pii` are all green.
When authentication was touched, confirm 403 on the rejecting side (no JWT / invalid signature / outside the allowlist / the dev path in production).

## References

Spec: `docs/superpowers/specs/2026-09-15-sumai-log-design.md`
Spec of vendor news fetching: `docs/superpowers/specs/2026-09-16-vendor-news-design.md`
