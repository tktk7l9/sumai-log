# 施工例の一覧（/works） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 業者 3 社の施工例を 1 つの一覧に出し、同じ項目立てで揃えて見られ、ルームツアー動画をアプリ内で見たら自動で「視聴済み」が付くようにする。

**Architecture:** 新しい `works` テーブルに、手元のスクリプト（`scripts/import-works.ts`）が生成した SQL で施工例を入れる。サイト別の HTML 読み取り・SQL 生成・絞り込み・視聴判定はすべて `src/lib/works/` の純粋関数。画面は `/works` の 1 ルートで、動画は `youtube-nocookie.com` の iframe と `postMessage` だけで再生位置を受け取る（YouTube のスクリプトは読み込まない）。

**Tech Stack:** TanStack Start / React 19 / Mantine 9 / Drizzle + Cloudflare D1 / zod / Vitest（node・workers・jsdom の 3 構成）/ tsx

**Spec:** `docs/superpowers/specs/2026-10-01-works-list-design.md`

## Global Constraints

- **実データをリポジトリに書かない。** 業者名・サイトの URL・ホスト名・施工例の名前や数値を、コード・テスト・コメント・コミット文に書かない。パーサは `siteA` `siteB` `siteC` と呼び、テストの HTML は `example.com` と架空の値で作る。`check:pii` は業者名を検出できないので、コミット前に差分を目で見る。
- ソースコード内（識別子・コメント・テスト名・ログ・スクリプトの出力）は英語。日本語は画面に出る文言だけ。
- `src/lib/` は純粋関数のみで、行・分岐・関数・文とも 100% のカバレッジゲート（`npm run test:coverage`）。通らない分岐が出たらテストを足す（実装側に `/* v8 ignore */` を書かない）。
- 依存パッケージを増やさない（HTML は正規表現とタグ除去で読む）。
- 外部 API（LLM 等）に送らない。Cron は作らない。各社サイトの写真は表示も保存もしない。
- 値の無い項目は「—」を出さず、行ごと消す。視聴の状態は色だけで示さず、アイコンと「視聴済み」の文字で示す。
- 面積は坪（小数）。㎡ は `÷ 3.305785` で坪にして小数 2 桁に丸める。画面では末尾の 0 を落として出す（`50.5坪`）。
- 視聴の判定: `playerState === 0` または `duration > 0 && currentTime / duration >= 0.9`。
- 埋め込み先は `https://www.youtube-nocookie.com` の 1 ホストだけ。CSP の `script-src` は足さない。
- 認証の迂回路を作らない（サーバ関数は既存のグローバルミドルウェアを通る `createServerFn` だけ）。
- コミット文は既存の流儀（`feat(works): 日本語の要約`）。各コミットの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 本番 D1 へのマイグレーション適用と SQL の投入は本人が行う（エージェントは `--remote` を実行しない）。

## Review Focus

仕様が暗に求めるが、放っておくとどのテストも踏まない入力。各行のテストは持ち主のタスクに入れてある。

1. **埋め込みが再生できない（エラー 153）。** アプリは全レスポンスに `referrer-policy: no-referrer` を付けており、YouTube の埋め込みは Referer が無いと再生を拒む。iframe に `referrerPolicy="strict-origin-when-cross-origin"` が要る → Task 10 の UI テストで属性を確かめ、Task 11 で実ブラウザで再生を確かめる。
2. **別の送信元からの `message` で視聴済みになる。** `event.origin` が埋め込み先でない、または `event.source` がこの iframe でないメッセージは無視する → Task 10 の UI テスト。
3. **再取り込みで視聴チェック・手で貼った動画が消える／詳細ページの取得失敗で既存の値が null で上書きされる。** → Task 1 の workers テスト（生成 SQL を実 D1 に 2 回流す）と Task 6 の `crawlSite` のテスト（詳細が失敗した件は出力しない）。
4. **名前に引用符や改行を含む施工例で SQL が壊れる。** `wrangler d1 execute --file` は文を行で区切らないが、テストで使う `env.DB.exec` は 1 行 1 文。生成する文は必ず 1 行にし、値の改行は空白に畳む → Task 6 の `sql.test.ts`。
5. **ページ送りが循環して取り込みが終わらない／同じ施工例が二重に入る。** 訪問済みの集合・ページ数の上限・URL の重複排除 → Task 6 の `crawl.test.ts`。
6. **長さが取れない動画（ライブ配信・`duration` が 0）で即座に視聴済みになる。** → Task 7 の `watch.test.ts`。

## File Structure

| ファイル | 役割 |
| --- | --- |
| `src/db/schema.ts`（変更） | `works` テーブル・`Work` 型 |
| `drizzle/migrations/0011_*.sql`（生成） | `works` の作成 |
| `src/server/repository/works.ts` | `listWorksWithVendor` `setWorkWatched` `setWorkVideo` |
| `src/server/repository/works.worker-test.ts` | 上の 3 つ + 生成 SQL の再取り込み |
| `src/lib/works/types.ts` | `WorkFields` `WorkListEntry` `WorkListPage` `ParsedWork` `SiteParser` |
| `src/lib/works/html.ts` | `textOf` `absoluteUrl` `findYouTubeId` `pageLinks` |
| `src/lib/works/area.ts` | `sqmToTsubo` `parseNumber` `parseArea` `parseLabeledArea` |
| `src/lib/works/siteA.ts` `siteB.ts` `siteC.ts` | サイト別の `SiteParser` |
| `src/lib/works/config.ts` | `parseSitesConfig`（`works-sites.json` の検証） |
| `src/lib/works/crawl.ts` | `crawlSite`（読み込み関数を注入する取り込みの手順） |
| `src/lib/works/sql.ts` | `sqlValue` `workUpsertSql` |
| `src/lib/works/filter.ts` | `filterWorks` `watchedSummary` `vendorOptions` `specOf` `formatTsubo` |
| `src/lib/works/watch.ts` | `readPlayerMessage` `mergePlayerInfo` `shouldMarkWatched` `embedUrl` |
| `scripts/import-works.ts` | 取得・キャッシュ・SQL の書き出し |
| `src/server/works.schema.ts` / `works.ts` | zod と `createServerFn` |
| `src/components/works/worksSearch.ts` | search params の schema |
| `src/components/works/WorkCard.tsx` `WorkSpecs.tsx` `WorkPlayer.tsx` `WorkVideoForm.tsx` | 画面の部品 |
| `src/routes/works.tsx` | ページ |
| `src/components/AppLayout.tsx` `src/lib/securityHeaders.ts`（変更） | ナビに「施工例」・CSP `frame-src` |
| `test/ui/fixtures.ts` `src/server/repository/test-helpers.ts`（変更） | `work()` フィクスチャ・`reset` に `works` |
| `AGENTS.md`（変更） | 取り決めの追記 |

---

### Task 1: `works` テーブルとリポジトリ

**Files:**
- Modify: `src/db/schema.ts`（`videos` の定義の後ろに追加）
- Create: `drizzle/migrations/0011_*.sql`（`npm run db:generate` が作る）
- Create: `src/server/repository/works.ts`
- Modify: `src/server/repository/index.ts`（`export * from './works'` を足す）
- Modify: `src/server/repository/test-helpers.ts`（`reset` の配列の `'videos'` の次に `'works'`）
- Test: `src/server/repository/works.worker-test.ts`

**Interfaces:**
- Produces:
  - `works`（drizzle テーブル）, `type Work`, `type NewWork`, `WORK_VIDEO_SOURCES`
  - `type WorkRow = Work & { vendorName: string | null }`
  - `listWorksWithVendor(db: Db): Promise<WorkRow[]>`
  - `setWorkWatched(db: Db, id: string, watched: boolean, actorEmail: string): Promise<boolean>`（行があれば true）
  - `setWorkVideo(db: Db, id: string, videoId: string | null): Promise<boolean>`

- [ ] **Step 1: スキーマを足す**

`src/db/schema.ts` の `videos` テーブルの直後に:

```ts
export const WORK_VIDEO_SOURCES = ['auto', 'manual'] as const

/**
 * Built examples published on vendors' sites (/works). Rows come from the SQL that
 * scripts/import-works.ts generates; the app itself only changes the video and the
 * watched columns. Areas are in tsubo.
 */
export const works = sqliteTable(
  'works',
  {
    id: id(),
    /** Detail page of the example. The key the import matches on */
    sourceUrl: text('source_url').notNull().unique(),
    /** Key of the site in seed.local/works-sites.json */
    site: text('site').notNull(),
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    category: text('category'),
    location: text('location'),
    /** 'YYYY-MM' or 'YYYY' */
    completedOn: text('completed_on'),
    points: jsonList('points'),
    uaValue: real('ua_value'),
    cValue: real('c_value'),
    family: text('family'),
    siteAreaTsubo: real('site_area_tsubo'),
    floorAreaTsubo: real('floor_area_tsubo'),
    totalAreaTsubo: real('total_area_tsubo'),
    layout: text('layout'),
    youtubeVideoId: text('youtube_video_id'),
    /** Who set youtube_video_id. null is treated as 'auto'. A 'manual' one survives re-imports */
    videoSource: text('video_source', { enum: WORK_VIDEO_SOURCES }),
    /** ISO-8601. null = not watched yet. One flag shared by the two users */
    watchedAt: text('watched_at'),
    watchedBy: text('watched_by'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('works_vendor_idx').on(t.vendorId)],
)
```

型の輸出が並んでいる所（`export type Video = …` の近く）に:

```ts
export type Work = typeof works.$inferSelect
export type NewWork = typeof works.$inferInsert
```

- [ ] **Step 2: マイグレーションを生成してローカルに当てる**

Run: `npm run db:generate && npm run db:migrate:local`
Expected: `drizzle/migrations/0011_<name>.sql` ができ、中身は `CREATE TABLE \`works\`` と `works_source_url_unique`・`works_vendor_idx` の 2 つの索引だけ（他のテーブルへの変更が混ざっていたら止めて報告する）。

- [ ] **Step 3: `reset` に `works` を足す**

`src/server/repository/test-helpers.ts` の配列で `'videos',` の次の行に `'works',` を入れる（`vendors` より前。外部キーの順）。

- [ ] **Step 4: 失敗するテストを書く**

`src/server/repository/works.worker-test.ts`:

```ts
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { vendors, works, type NewWork } from '../../db/schema'
import { actor, db, reset } from './test-helpers'
import { listWorksWithVendor, setWorkVideo, setWorkWatched } from './works'

beforeEach(reset)

const VENDOR_ID = '00000000-0000-4000-8000-000000000001'

async function addVendor(id: string, name: string) {
  await db.insert(vendors).values({ id, name, createdBy: actor })
}

async function addWork(over: Partial<NewWork> = {}): Promise<string> {
  const id = over.id ?? crypto.randomUUID()
  await db.insert(works).values({
    sourceUrl: `https://example.com/works/${id}`,
    site: 'siteA',
    title: 'テストの家',
    ...over,
    id,
  })
  return id
}

describe('works repository', () => {
  it('lists works with the vendor name, ordered by vendor, site and sort order', async () => {
    await addVendor(VENDOR_ID, 'テスト工務店')
    await addWork({ title: '二番目', vendorId: VENDOR_ID, sortOrder: 1 })
    await addWork({ title: '一番目', vendorId: VENDOR_ID, sortOrder: 0 })
    await addWork({ title: '業者なし', site: 'siteB' })
    const rows = await listWorksWithVendor(db)
    expect(rows.map((r) => [r.title, r.vendorName])).toEqual([
      ['一番目', 'テスト工務店'],
      ['二番目', 'テスト工務店'],
      ['業者なし', null],
    ])
    expect(rows[0]?.points).toEqual([])
  })

  it('marks a work as watched with the time and the actor, and clears both again', async () => {
    const id = await addWork()
    expect(await setWorkWatched(db, id, true, actor)).toBe(true)
    const [watched] = await db.select().from(works).where(eq(works.id, id))
    expect(watched?.watchedBy).toBe(actor)
    expect(watched?.watchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    expect(await setWorkWatched(db, id, false, actor)).toBe(true)
    const [cleared] = await db.select().from(works).where(eq(works.id, id))
    expect(cleared?.watchedAt).toBeNull()
    expect(cleared?.watchedBy).toBeNull()
  })

  it('returns false when the work does not exist', async () => {
    expect(await setWorkWatched(db, crypto.randomUUID(), true, actor)).toBe(false)
    expect(await setWorkVideo(db, crypto.randomUUID(), 'abcdefghijk')).toBe(false)
  })

  it('sets a pasted video as manual and removing it resets the source', async () => {
    const id = await addWork()
    expect(await setWorkVideo(db, id, 'abcdefghijk')).toBe(true)
    const [set] = await db.select().from(works).where(eq(works.id, id))
    expect([set?.youtubeVideoId, set?.videoSource]).toEqual(['abcdefghijk', 'manual'])

    await setWorkVideo(db, id, null)
    const [removed] = await db.select().from(works).where(eq(works.id, id))
    expect([removed?.youtubeVideoId, removed?.videoSource]).toEqual([null, null])
  })

  it('keeps the work and nulls vendor_id when the vendor is deleted', async () => {
    await addVendor(VENDOR_ID, 'テスト工務店')
    const id = await addWork({ vendorId: VENDOR_ID })
    await db.delete(vendors).where(eq(vendors.id, VENDOR_ID))
    const [row] = await db.select().from(works).where(eq(works.id, id))
    expect(row?.vendorId).toBeNull()
  })
})
```

`vendors` の必須列が `id` `name` `createdBy` 以外にもあって挿入が失敗する場合は、同じディレクトリの `candidates.worker-test.ts` が業者を作っている方法（`upsertVendor`）に合わせる。

- [ ] **Step 5: テストが落ちることを確かめる**

Run: `npx vitest run --config vitest.workers.config.ts src/server/repository/works.worker-test.ts`
Expected: FAIL（`./works` が無い）

- [ ] **Step 6: リポジトリを実装する**

`src/server/repository/works.ts`:

```ts
import { asc, eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { vendors, works, type Work } from '../../db/schema'

export type WorkRow = Work & { vendorName: string | null }

/** All works with the vendor name: vendor -> site -> the order on the site's own list */
export async function listWorksWithVendor(db: Db): Promise<WorkRow[]> {
  const rows = await db
    .select({ work: works, vendorName: vendors.name })
    .from(works)
    .leftJoin(vendors, eq(works.vendorId, vendors.id))
    .orderBy(sql`${vendors.name} IS NULL`, asc(vendors.name), asc(works.site), asc(works.sortOrder))
  return rows.map((r) => ({ ...r.work, vendorName: r.vendorName ?? null }))
}

/**
 * One watched flag shared by the two users. No stale-write check: both setting it at the same
 * time ends in the same state. Returns false when the work is gone
 */
export async function setWorkWatched(
  db: Db,
  id: string,
  watched: boolean,
  actorEmail: string,
): Promise<boolean> {
  const rows = await db
    .update(works)
    .set({
      watchedAt: watched ? new Date().toISOString() : null,
      watchedBy: watched ? actorEmail : null,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(works.id, id))
    .returning({ id: works.id })
  return rows.length > 0
}

/** A video pasted by hand ('manual' survives re-imports). null removes it and lets the import fill it again */
export async function setWorkVideo(db: Db, id: string, videoId: string | null): Promise<boolean> {
  const rows = await db
    .update(works)
    .set({
      youtubeVideoId: videoId,
      videoSource: videoId ? 'manual' : null,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(works.id, id))
    .returning({ id: works.id })
  return rows.length > 0
}
```

`src/server/repository/index.ts` の `export * from './videos'` の次に `export * from './works'` を足す。

- [ ] **Step 7: テストが通ることを確かめる**

Run: `npx vitest run --config vitest.workers.config.ts src/server/repository/works.worker-test.ts && npm run typecheck`
Expected: PASS（5 件）・型エラーなし

- [ ] **Step 8: コミット**

```bash
npm run check:pii
git add src/db/schema.ts drizzle/migrations src/server/repository/works.ts src/server/repository/works.worker-test.ts src/server/repository/index.ts src/server/repository/test-helpers.ts
git commit -m "feat(works): 施工例のテーブルと視聴・動画の保存を足す"
```

---

### Task 2: 読み取りの土台（型・HTML・面積）

**Files:**
- Create: `src/lib/works/types.ts` `src/lib/works/html.ts` `src/lib/works/area.ts`
- Test: `src/lib/works/html.test.ts` `src/lib/works/area.test.ts`

**Interfaces:**
- Produces:
  - `type WorkFields`（下のコード）, `EMPTY_FIELDS: WorkFields`
  - `type WorkListEntry = { url: string } & Partial<WorkFields>`
  - `type WorkListPage = { entries: WorkListEntry[]; pageUrls: string[] }`
  - `type SiteParser = { parseList(html: string, pageUrl: string): WorkListPage; parseDetail(html: string): Partial<WorkFields> }`
  - `type ParsedWork = WorkFields & { title: string; sourceUrl: string; site: string; vendorId: string | null; sortOrder: number }`
  - `textOf(html: string): string` / `absoluteUrl(href: string, base: string): string | null` / `findYouTubeId(html: string): string | null` / `pageLinks(html: string, pageUrl: string): string[]`
  - `sqmToTsubo(sqm: number): number` / `parseNumber(text: string): number | null` / `parseArea(text: string): number | null` / `parseLabeledArea(text: string, label: string): number | null`

- [ ] **Step 1: 型を書く（テスト不要・実行コードなしの定数 1 つ）**

`src/lib/works/types.ts`:

```ts
/** What a site can tell about one built example. Areas are in tsubo */
export type WorkFields = {
  title: string | null
  category: string | null
  location: string | null
  /** 'YYYY-MM' or 'YYYY' */
  completedOn: string | null
  points: string[]
  uaValue: number | null
  cValue: number | null
  family: string | null
  siteAreaTsubo: number | null
  floorAreaTsubo: number | null
  totalAreaTsubo: number | null
  layout: string | null
  youtubeVideoId: string | null
}

export const EMPTY_FIELDS: WorkFields = {
  title: null,
  category: null,
  location: null,
  completedOn: null,
  points: [],
  uaValue: null,
  cValue: null,
  family: null,
  siteAreaTsubo: null,
  floorAreaTsubo: null,
  totalAreaTsubo: null,
  layout: null,
  youtubeVideoId: null,
}

/** One example on a list page, with whatever the list already shows about it */
export type WorkListEntry = { url: string } & Partial<WorkFields>

/** entries: examples on this page. pageUrls: the other list pages this page links to */
export type WorkListPage = { entries: WorkListEntry[]; pageUrls: string[] }

export type SiteParser = {
  parseList(html: string, pageUrl: string): WorkListPage
  parseDetail(html: string): Partial<WorkFields>
}

export type ParsedWork = WorkFields & {
  title: string
  sourceUrl: string
  site: string
  vendorId: string | null
  sortOrder: number
}
```

- [ ] **Step 2: 失敗するテストを書く**

`src/lib/works/html.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { absoluteUrl, findYouTubeId, pageLinks, textOf } from './html'

describe('textOf', () => {
  it('drops tags, decodes entities and collapses whitespace', () => {
    expect(textOf('<p> A&amp;B&nbsp;<strong>C</strong>\n &lt;D&gt; &quot;E&quot; &#39;F&#39; </p>')).toBe(
      'A&B C <D> "E" \'F\'',
    )
  })

  it('turns line breaks and list items into spaces so neighbours do not glue together', () => {
    expect(textOf('敷地面積 80坪<br>延床面積 30坪<ul><li>一</li><li>二</li></ul>')).toBe(
      '敷地面積 80坪 延床面積 30坪 一 二',
    )
  })

  it('drops script and style bodies', () => {
    expect(textOf('<style>p{}</style>本文<script>var a = "<p>"</script>')).toBe('本文')
  })
})

describe('absoluteUrl', () => {
  it('resolves relative and absolute hrefs against the page', () => {
    expect(absoluteUrl('a_01.php', 'https://example.com/case/')).toBe(
      'https://example.com/case/a_01.php',
    )
    expect(absoluteUrl('https://example.com/works/p1/', 'https://example.com/works/')).toBe(
      'https://example.com/works/p1/',
    )
  })

  it('returns null for a broken base or a non-http target', () => {
    expect(absoluteUrl('a.php', 'not a url')).toBeNull()
    expect(absoluteUrl('javascript:void(0)', 'https://example.com/')).toBeNull()
  })
})

describe('findYouTubeId', () => {
  it('finds the id in a watch link, a short link and an embed (nocookie too)', () => {
    expect(findYouTubeId('<a href="https://www.youtube.com/watch?v=abcdefghijk">')).toBe(
      'abcdefghijk',
    )
    expect(findYouTubeId('<a href="https://youtu.be/ABCDEFGHIJK?si=x">')).toBe('ABCDEFGHIJK')
    expect(findYouTubeId('<iframe src="https://www.youtube.com/embed/a_c-efghijk?si=x">')).toBe(
      'a_c-efghijk',
    )
    expect(findYouTubeId('<iframe src="https://www.youtube-nocookie.com/embed/abcdefghijk">')).toBe(
      'abcdefghijk',
    )
  })

  it('returns null for a channel link or no link', () => {
    expect(findYouTubeId('<a href="https://www.youtube.com/@example">')).toBeNull()
    expect(findYouTubeId('<p>none</p>')).toBeNull()
  })
})

describe('pageLinks', () => {
  const html =
    '<a href="https://example.com/works/page/2/">2</a><a href="/works/page/3/">3</a>' +
    '<a href="https://example.com/works/page/2/">next</a><a href="https://example.com/blog/page/2/">x</a>' +
    '<a href="mailto:a@example.com/page/9/">mail</a>'

  it('returns the other pages of the same list, once each', () => {
    expect(pageLinks(html, 'https://example.com/works/')).toEqual([
      'https://example.com/works/page/2/',
      'https://example.com/works/page/3/',
    ])
  })

  it('works from a later page and leaves out the page itself', () => {
    expect(pageLinks(html, 'https://example.com/works/page/2/')).toEqual([
      'https://example.com/works/page/3/',
    ])
  })

  it('returns nothing when the page url is broken', () => {
    expect(pageLinks(html, 'not a url')).toEqual([])
  })
})
```

`src/lib/works/area.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { parseArea, parseLabeledArea, parseNumber, sqmToTsubo } from './area'

describe('sqmToTsubo', () => {
  it('divides by 3.305785 and rounds to 2 decimals', () => {
    expect(sqmToTsubo(100)).toBe(30.25)
    expect(sqmToTsubo(120)).toBe(36.3)
  })
})

describe('parseNumber', () => {
  it('reads the first decimal number, full-width digits included', () => {
    expect(parseNumber('UA値 0.35')).toBe(0.35)
    expect(parseNumber('０．３１W(㎡・K)')).toBe(0.31)
    expect(parseNumber('C値0.6')).toBe(0.6)
  })

  it('returns null when there is no number', () => {
    expect(parseNumber('未計測')).toBeNull()
  })
})

describe('parseArea', () => {
  it('keeps tsubo as is and converts square metres', () => {
    expect(parseArea('50.50坪')).toBe(50.5)
    expect(parseArea('120㎡')).toBe(36.3)
    expect(parseArea('120 m2')).toBe(36.3)
    expect(parseArea('120m²')).toBe(36.3)
  })

  it('returns null without a unit or a number', () => {
    expect(parseArea('120')).toBeNull()
    expect(parseArea('坪')).toBeNull()
  })
})

describe('parseLabeledArea', () => {
  const text = '敷地面積 50.50坪 延床面積 30.20坪 総施工面積 33.15坪'

  it('reads the area that follows the label', () => {
    expect(parseLabeledArea(text, '敷地面積')).toBe(50.5)
    expect(parseLabeledArea(text, '延床面積')).toBe(30.2)
    expect(parseLabeledArea(text, '総施工面積')).toBe(33.15)
  })

  it('returns null when the label is missing', () => {
    expect(parseLabeledArea('延床面積 31.5坪', '敷地面積')).toBeNull()
  })
})
```

- [ ] **Step 3: 落ちることを確かめる**

Run: `npx vitest run src/lib/works`
Expected: FAIL（`./html` `./area` が無い）

- [ ] **Step 4: 実装する**

`src/lib/works/html.ts`:

```ts
/**
 * Small HTML helpers for the site parsers (src/lib/works/site*.ts). Regular expressions and
 * tag stripping only: the pages are simple, and no HTML parser is added as a dependency.
 */

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

/** Visible text of an HTML fragment on one line */
export function textOf(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|nbsp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] as string)
    .replace(/\s+/g, ' ')
    .trim()
}

/** href resolved against the page it was found on. null unless the result is http(s) */
export function absoluteUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

const YOUTUBE_ID =
  /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/

/** First YouTube video id linked or embedded in the fragment */
export function findYouTubeId(html: string): string | null {
  return YOUTUBE_ID.exec(html)?.[1] ?? null
}

/**
 * The other pages of a paginated list: links shaped `<list>/page/<n>/` under the same list as
 * pageUrl, without duplicates and without pageUrl itself
 */
export function pageLinks(html: string, pageUrl: string): string[] {
  const self = absoluteUrl(pageUrl, pageUrl)
  if (!self) return []
  const listBase = self.replace(/page\/\d+\/?$/, '')
  const found = new Set<string>()
  for (const match of html.matchAll(/href="([^"]*\/page\/\d+\/?)"/g)) {
    const url = absoluteUrl(match[1] as string, self)
    if (url && url !== self && url.startsWith(`${listBase}page/`)) found.add(url)
  }
  return [...found]
}
```

`src/lib/works/area.ts`:

```ts
/** Areas are stored in tsubo. 1 tsubo = 3.305785 m2 */
const SQM_PER_TSUBO = 3.305785

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function sqmToTsubo(sqm: number): number {
  return round2(sqm / SQM_PER_TSUBO)
}

/** First decimal number in the text. NFKC folds full-width digits and the dot */
export function parseNumber(text: string): number | null {
  const match = /\d+(?:\.\d+)?/.exec(text.normalize('NFKC'))
  return match ? Number(match[0]) : null
}

/** '50.50坪' -> 50.5, '120㎡' -> 36.3. NFKC turns ㎡ and m² into 'm2'. null without a unit */
export function parseArea(text: string): number | null {
  const match = /(\d+(?:\.\d+)?)\s*(坪|m2)/.exec(text.normalize('NFKC'))
  if (!match) return null
  const value = Number(match[1])
  return match[2] === '坪' ? round2(value) : sqmToTsubo(value)
}

/** The area right after a label, e.g. parseLabeledArea('延床面積 30.20坪', '延床面積') */
export function parseLabeledArea(text: string, label: string): number | null {
  const at = text.indexOf(label)
  if (at < 0) return null
  return parseArea(text.slice(at + label.length, at + label.length + 20))
}
```

- [ ] **Step 5: 通ることとカバレッジを確かめる**

Run: `npx vitest run src/lib/works && npm run test:coverage`
Expected: PASS・カバレッジ 100%（`src/lib/works/*` の行に未到達があれば、その分岐のテストを足す）

- [ ] **Step 6: コミット**

```bash
git add src/lib/works
git commit -m "feat(works): 施工例の読み取りの土台（型・HTML・坪への換算）"
```

---

### Task 3: siteA のパーサ（一覧 1 ページ・詳細に「Data」欄・一覧に動画リンク）

**Files:**
- Create: `src/lib/works/siteA.ts`
- Test: `src/lib/works/siteA.test.ts`

**Interfaces:**
- Consumes: `SiteParser` `WorkFields` `WorkListPage`（types.ts）, `textOf` `absoluteUrl` `findYouTubeId`（html.ts）, `parseLabeledArea` `parseNumber`（area.ts）
- Produces: `export const siteA: SiteParser`

サイトの形（架空の値で再現）: 一覧は `<li><a href="x_01.php">…<dt>名前</dt>…</a>［動画があれば youtube へのリンク］</li>`。アンカーの中に入れ子の `<li>` がある。詳細は `<section id="caseData">` の中に「ポイント」の `<ul>` と、`<th>` が 家族構成／面積／間取り の表。

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/works/siteA.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { siteA } from './siteA'

const LIST = `
<ul>
  <li><a href="a_01.php">
    <span class="imgBox"><img src="a_01/main.jpg" alt="テストの家"></span>
    <dl>
      <dt>テストの家</dt>
      <dd class="details"><table><tr><th>面積</th><td><ul><li>延床面積 30.0坪</li></ul></td></tr></table></dd>
    </dl>
  </a>
  <!-- video -->
  <div class="aspectBox"><span class="videoIcon"><a href="https://www.youtube.com/watch?v=abcdefghijk" class="youtubeLink"><img src="m.png"></a></span></div>
  </li>
  <li><a href="b_02.php">
    <dl><dt>見本の&amp;家</dt></dl>
  </a></li>
  <li><a href="a_01.php"><dl><dt>テストの家</dt></dl></a></li>
  <li><a href="c_03.php"><span>no title</span></a></li>
  <li><a href="../contact/">問い合わせ</a></li>
</ul>
<a href="https://www.youtube.com/watch?v=zzzzzzzzzzz">promo</a>`

const DETAIL = `
<h1>テストの家</h1>
<section id="caseData" class="secBox">
  <h2 class="secTitle">Data</h2>
  <div class="tags"><h3>ポイント</h3>
    <ul>
      <li><strong>断熱性能：UA値0.31</strong></li>
      <li><strong>気密性能：C値0.6</strong></li>
      <li><strong>耐震等級3</strong></li>
    </ul>
  </div>
  <table class="detail">
    <tr><th scope="row"><span class="text">家族構成</span></th><td>大人2人、子供1人</td></tr>
    <tr><th scope="row"><span class="text">面積</span></th><td>敷地面積 50.50坪<br>延床面積 30.20坪<br>総施工面積 33.15坪</td></tr>
    <tr><th scope="row"><span class="text">間取り</span></th><td>2LDK＋書斎</td></tr>
  </table>
</section>
<section id="caseSchedule"><table><tr><th>2020年</th><td>着工</td></tr></table></section>`

describe('siteA.parseList', () => {
  const page = siteA.parseList(LIST, 'https://example.com/case/')

  it('lists each example once with its title, in page order', () => {
    expect(page.entries.map((e) => [e.url, e.title])).toEqual([
      ['https://example.com/case/a_01.php', 'テストの家'],
      ['https://example.com/case/b_02.php', '見本の&家'],
    ])
  })

  it('takes the video only from the same list item', () => {
    expect(page.entries[0]?.youtubeVideoId).toBe('abcdefghijk')
    expect(page.entries[1]?.youtubeVideoId).toBeNull()
  })

  it('has no other pages', () => {
    expect(page.pageUrls).toEqual([])
  })

  it('returns nothing when the page url is broken', () => {
    expect(siteA.parseList(LIST, 'not a url').entries).toEqual([])
  })
})

describe('siteA.parseDetail', () => {
  it('reads the Data block', () => {
    expect(siteA.parseDetail(DETAIL)).toEqual({
      points: ['断熱性能：UA値0.31', '気密性能：C値0.6', '耐震等級3'],
      uaValue: 0.31,
      cValue: 0.6,
      family: '大人2人、子供1人',
      siteAreaTsubo: 50.5,
      floorAreaTsubo: 30.2,
      totalAreaTsubo: 33.15,
      layout: '2LDK＋書斎',
    })
  })

  it('leaves missing rows null and points empty', () => {
    const html =
      '<section id="caseData"><table><tr><th>面積</th><td>延床面積 31.5坪</td></tr></table></section>'
    expect(siteA.parseDetail(html)).toEqual({
      points: [],
      uaValue: null,
      cValue: null,
      family: null,
      siteAreaTsubo: null,
      floorAreaTsubo: 31.5,
      totalAreaTsubo: null,
      layout: null,
    })
  })

  it('reads no area when the table has no area row', () => {
    const html =
      '<section id="caseData"><table><tr><th>家族構成</th><td>大人2人</td></tr></table></section>'
    expect(siteA.parseDetail(html)).toMatchObject({ family: '大人2人', floorAreaTsubo: null })
  })

  it('returns nothing when the page has no Data block', () => {
    expect(siteA.parseDetail('<h1>404</h1>')).toEqual({})
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/lib/works/siteA.test.ts`
Expected: FAIL（`./siteA` が無い）

- [ ] **Step 3: 実装する**

`src/lib/works/siteA.ts`:

```ts
import { parseLabeledArea, parseNumber } from './area'
import { absoluteUrl, findYouTubeId, textOf } from './html'
import type { SiteParser, WorkFields, WorkListEntry } from './types'

/**
 * Site A: one list page; every item is `<li><a href="x_01.php">...<dt>title</dt>...</a>
 * [tour video link]</li>`, and the detail page has a "Data" section (points, family, area,
 * layout). The anchor contains nested <li>, so an item is cut at the first </li> after </a>.
 */
const ITEM = /<a href="([a-z]+_\d+\.php)">([\s\S]*?)<\/a>([\s\S]*?)<\/li>/g

function parseList(html: string, pageUrl: string) {
  const entries = new Map<string, WorkListEntry>()
  for (const [, href, body, tail] of html.matchAll(ITEM)) {
    const url = absoluteUrl(href as string, pageUrl)
    const title = /<dt>([\s\S]*?)<\/dt>/.exec(body as string)
    if (!url || !title || entries.has(url)) continue
    entries.set(url, {
      url,
      title: textOf(title[1] as string),
      youtubeVideoId: findYouTubeId(tail as string),
    })
  }
  return { entries: [...entries.values()], pageUrls: [] }
}

/** th text -> td text of the table rows in the fragment */
function rowsOf(html: string): Map<string, string> {
  const rows = new Map<string, string>()
  for (const [, th, td] of html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g)) {
    rows.set(textOf(th as string), textOf(td as string))
  }
  return rows
}

function labeledNumber(points: string[], label: string): number | null {
  const line = points.find((p) => p.includes(label))
  return line ? parseNumber(line.slice(line.indexOf(label))) : null
}

function parseDetail(html: string): Partial<WorkFields> {
  const section = /<section id="caseData"[\s\S]*?<\/section>/.exec(html)?.[0]
  if (!section) return {}
  const tags = /class="tags"[\s\S]*?<\/ul>/.exec(section)?.[0] ?? ''
  const points = [...tags.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1] as string))
  const rows = rowsOf(section)
  const area = rows.get('面積') ?? ''
  return {
    points,
    uaValue: labeledNumber(points, 'UA値'),
    cValue: labeledNumber(points, 'C値'),
    family: rows.get('家族構成') ?? null,
    siteAreaTsubo: parseLabeledArea(area, '敷地面積'),
    floorAreaTsubo: parseLabeledArea(area, '延床面積'),
    totalAreaTsubo: parseLabeledArea(area, '総施工面積'),
    layout: rows.get('間取り') ?? null,
  }
}

export const siteA: SiteParser = { parseList, parseDetail }
```

- [ ] **Step 4: 通ることとカバレッジを確かめる**

Run: `npx vitest run src/lib/works/siteA.test.ts && npm run test:coverage`
Expected: PASS・100%

- [ ] **Step 5: コミット**

```bash
git add src/lib/works/siteA.ts src/lib/works/siteA.test.ts
git commit -m "feat(works): siteA の施工例パーサ"
```

---

### Task 4: siteB のパーサ（ページ送りあり・一覧に名前と種別・詳細に竣工年月だけ）

**Files:**
- Create: `src/lib/works/siteB.ts`
- Test: `src/lib/works/siteB.test.ts`

**Interfaces:**
- Consumes: `SiteParser` `WorkFields`（types.ts）, `textOf` `absoluteUrl` `pageLinks`（html.ts）
- Produces: `export const siteB: SiteParser`

サイトの形: 一覧は `<ul class="works-list …"><li><a href="絶対URL">…<p class="font-sm">種別</p><h2 class="font-md">名前</h2></a></li>…</ul>`、ページ送りは `…/page/2/`。詳細は本文中の `<p>竣工：2026年6月</p>` だけ。

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/works/siteB.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { siteB } from './siteB'

const LIST = `
<ul class="menu"><li><a href="https://example.com/housing/newly">新築</a></li></ul>
<ul class="works-list bottom-md">
  <li>
    <a href="https://example.com/works/newly/2026/0001.html">
      <div class="works-list_img"><img src="https://example.com/a.jpg" alt=""></div>
      <p class="font-sm">新築</p>          <h2 class="font-md">テストの家（てすと）</h2>
    </a>
  </li>
  <li>
    <a href="https://example.com/works/reform/2025/0002.html">
      <h2 class="font-md">種別のない家</h2>
    </a>
  </li>
  <li><a href="https://example.com/works/newly/2024/0003.html"><p class="font-sm">新築</p></a></li>
</ul>
<a href="https://example.com/works/page/2/">2</a>`

describe('siteB.parseList', () => {
  const page = siteB.parseList(LIST, 'https://example.com/works/')

  it('reads title and category of the items inside the works list only', () => {
    expect(page.entries).toEqual([
      { url: 'https://example.com/works/newly/2026/0001.html', title: 'テストの家（てすと）', category: '新築' },
      { url: 'https://example.com/works/reform/2025/0002.html', title: '種別のない家', category: null },
    ])
  })

  it('follows the pagination', () => {
    expect(page.pageUrls).toEqual(['https://example.com/works/page/2/'])
  })

  it('returns nothing when the list is missing', () => {
    expect(siteB.parseList('<p>none</p>', 'https://example.com/works/').entries).toEqual([])
  })

  it('returns nothing when the page url is broken', () => {
    expect(siteB.parseList(LIST, 'not a url')).toEqual({ entries: [], pageUrls: [] })
  })
})

describe('siteB.parseDetail', () => {
  it('reads the completion month', () => {
    expect(siteB.parseDetail('<p>竣工：2026年6月</p>')).toEqual({ completedOn: '2026-06' })
    expect(siteB.parseDetail('<p>竣工:2025年12月</p>')).toEqual({ completedOn: '2025-12' })
  })

  it('keeps the year alone when there is no month', () => {
    expect(siteB.parseDetail('<p>竣工：2024年</p>')).toEqual({ completedOn: '2024' })
  })

  it('returns null when the page does not say', () => {
    expect(siteB.parseDetail('<p>本文</p>')).toEqual({ completedOn: null })
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/lib/works/siteB.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/lib/works/siteB.ts`:

```ts
import { absoluteUrl, pageLinks, textOf } from './html'
import type { SiteParser, WorkFields, WorkListEntry } from './types'

/**
 * Site B: a paginated list inside `<ul class="works-list ...">`; each item shows the category
 * and the title. The detail page has no data block, only the completion month in the body
 * ("竣工：2026年6月" = Completed: June 2026).
 */
function parseList(html: string, pageUrl: string) {
  const list = /<ul class="works-list[\s\S]*?<\/ul>/.exec(html)?.[0] ?? ''
  const entries: WorkListEntry[] = []
  for (const [, href, body] of list.matchAll(/<a href="([^"]+)">([\s\S]*?)<\/a>/g)) {
    const url = absoluteUrl(href as string, pageUrl)
    const title = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(body as string)
    if (!url || !title) continue
    const category = /<p class="font-sm">([\s\S]*?)<\/p>/.exec(body as string)
    entries.push({
      url,
      title: textOf(title[1] as string),
      category: category ? textOf(category[1] as string) : null,
    })
  }
  return { entries, pageUrls: pageLinks(html, pageUrl) }
}

function parseDetail(html: string): Partial<WorkFields> {
  const match = /竣工\s*[:：]\s*(\d{4})年(?:\s*(\d{1,2})月)?/.exec(html.normalize('NFKC'))
  if (!match) return { completedOn: null }
  const [, year, month] = match
  return { completedOn: month ? `${year}-${month.padStart(2, '0')}` : (year as string) }
}

export const siteB: SiteParser = { parseList, parseDetail }
```

注意: `html.normalize('NFKC')` は全角コロン `：` を半角 `:` にするので、正規表現の `[:：]` は両方に効く（テストの 2 つ目が半角を確かめている）。

- [ ] **Step 4: 通ることとカバレッジを確かめる**

Run: `npx vitest run src/lib/works/siteB.test.ts && npm run test:coverage`
Expected: PASS・100%

- [ ] **Step 5: コミット**

```bash
git add src/lib/works/siteB.ts src/lib/works/siteB.test.ts
git commit -m "feat(works): siteB の施工例パーサ"
```

---

### Task 5: siteC のパーサ（ページ送りあり・一覧に所在地と数値・詳細に埋め込み動画）

**Files:**
- Create: `src/lib/works/siteC.ts`
- Test: `src/lib/works/siteC.test.ts`

**Interfaces:**
- Consumes: `SiteParser` `WorkFields`（types.ts）, `textOf` `absoluteUrl` `pageLinks` `findYouTubeId`（html.ts）, `parseArea` `parseNumber`（area.ts）
- Produces: `export const siteC: SiteParser`

サイトの形: 一覧は `<ul class="system-list"><li><a class="" href="絶対URL">…<p class="cate-icon"><span …>種別</span></p>…<p class="system-ttl-01">名前</p><p class="system-area">市</p><p class="system-total_area"><span class="system-total_area-span-01">延べ床面積</span><span class="system-total_area-span-02">120㎡</span></p>（UA値・C値も同じ形）</a></li>`。詳細は本文に YouTube の `<iframe>`。

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/works/siteC.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { siteC } from './siteC'

const SPEC = (label: string, value: string) =>
  `<p class="system-total_area"><span class="system-total_area-span-01">${label}</span><span class="system-total_area-span-02">${value}</span></p>`

const LIST = `
<ul class="system-list">
<li>
<a class="" href="https://example.com/works/p1/">
 <p class="cate-icon"><span class="x">注文住宅</span></p>
<p class="system-ttl-01">【テスト市】見本の家</p>
<p class="system-area">テスト市</p>
${SPEC('延べ床面積', '100㎡')}
${SPEC('UA値', '0.37W(㎡・K)')}
${SPEC('C値', '0.8㎠/㎡')}
</a></li>
<li>
<a class="" href="https://example.com/works/p2/">
<p class="system-ttl-01">数値のない家</p>
</a></li>
<li><a href="https://example.com/works/p3/"><p class="system-area">名前なし</p></a></li>
</ul>
<a href="https://example.com/works/page/2/">2</a><a href="https://example.com/works/page/3/">3</a>`

describe('siteC.parseList', () => {
  const page = siteC.parseList(LIST, 'https://example.com/works/')

  it('reads the specs shown on the list', () => {
    expect(page.entries[0]).toEqual({
      url: 'https://example.com/works/p1/',
      title: '【テスト市】見本の家',
      category: '注文住宅',
      location: 'テスト市',
      floorAreaTsubo: 30.25,
      uaValue: 0.37,
      cValue: 0.8,
    })
  })

  it('leaves what the item does not show null, and skips items without a title', () => {
    expect(page.entries[1]).toEqual({
      url: 'https://example.com/works/p2/',
      title: '数値のない家',
      category: null,
      location: null,
      floorAreaTsubo: null,
      uaValue: null,
      cValue: null,
    })
    expect(page.entries).toHaveLength(2)
  })

  it('follows the pagination', () => {
    expect(page.pageUrls).toEqual([
      'https://example.com/works/page/2/',
      'https://example.com/works/page/3/',
    ])
  })

  it('returns nothing when the list is missing', () => {
    expect(siteC.parseList('<p>none</p>', 'https://example.com/works/').entries).toEqual([])
  })

  it('returns nothing when the page url is broken', () => {
    expect(siteC.parseList(LIST, 'not a url')).toEqual({ entries: [], pageUrls: [] })
  })
})

describe('siteC.parseDetail', () => {
  it('finds the embedded tour video', () => {
    const html =
      '<div class="wysiwyg"><p><iframe title="YouTube video player" src="https://www.youtube.com/embed/abcdefghijk?si=x"></iframe></p></div>'
    expect(siteC.parseDetail(html)).toEqual({ youtubeVideoId: 'abcdefghijk' })
  })

  it('returns null when there is no video', () => {
    expect(siteC.parseDetail('<div class="wysiwyg"><p>本文</p></div>')).toEqual({
      youtubeVideoId: null,
    })
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/lib/works/siteC.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/lib/works/siteC.ts`:

```ts
import { parseArea, parseNumber } from './area'
import { absoluteUrl, findYouTubeId, pageLinks, textOf } from './html'
import type { SiteParser, WorkFields, WorkListEntry } from './types'

/**
 * Site C: a paginated list inside `<ul class="system-list">`; each item already shows the
 * category, the city, the floor area (m2), UA and C. The detail page only adds the tour video,
 * embedded in the body. Family and layout are in free prose and are not read.
 */
const SPEC =
  /system-total_area-span-01">([\s\S]*?)<\/span><span class="system-total_area-span-02">([\s\S]*?)<\/span>/g

function classText(body: string, pattern: RegExp): string | null {
  const match = pattern.exec(body)
  return match ? textOf(match[1] as string) : null
}

function parseList(html: string, pageUrl: string) {
  const list = /<ul class="system-list">[\s\S]*?<\/ul>/.exec(html)?.[0] ?? ''
  const entries: WorkListEntry[] = []
  for (const [, href, body] of list.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = absoluteUrl(href as string, pageUrl)
    const title = classText(body as string, /class="system-ttl-01">([\s\S]*?)<\/p>/)
    if (!url || !title) continue
    const specs = new Map<string, string>()
    for (const [, label, value] of (body as string).matchAll(SPEC)) {
      specs.set(textOf(label as string), textOf(value as string))
    }
    entries.push({
      url,
      title,
      category: classText(body as string, /class="cate-icon"><span[^>]*>([\s\S]*?)<\/span>/),
      location: classText(body as string, /class="system-area">([\s\S]*?)<\/p>/),
      floorAreaTsubo: parseArea(specs.get('延べ床面積') ?? ''),
      uaValue: parseNumber(specs.get('UA値') ?? ''),
      cValue: parseNumber(specs.get('C値') ?? ''),
    })
  }
  return { entries, pageUrls: pageLinks(html, pageUrl) }
}

function parseDetail(html: string): Partial<WorkFields> {
  return { youtubeVideoId: findYouTubeId(html) }
}

export const siteC: SiteParser = { parseList, parseDetail }
```

- [ ] **Step 4: 通ることとカバレッジを確かめる**

Run: `npx vitest run src/lib/works/siteC.test.ts && npm run test:coverage`
Expected: PASS・100%

- [ ] **Step 5: コミット**

```bash
git add src/lib/works/siteC.ts src/lib/works/siteC.test.ts
git commit -m "feat(works): siteC の施工例パーサ"
```

---

### Task 6: 取り込み（設定・巡回・SQL・スクリプト）

**Files:**
- Create: `src/lib/works/config.ts` `src/lib/works/crawl.ts` `src/lib/works/sql.ts` `scripts/import-works.ts`
- Modify: `package.json`（scripts に `"import:works": "tsx scripts/import-works.ts"`）
- Modify: `src/server/repository/works.worker-test.ts`（再取り込みのテストを足す）
- Test: `src/lib/works/config.test.ts` `src/lib/works/crawl.test.ts` `src/lib/works/sql.test.ts`

**Interfaces:**
- Consumes: `SiteParser` `ParsedWork` `EMPTY_FIELDS`（types.ts）, `siteA` `siteB` `siteC`
- Produces:
  - `PARSER_NAMES = ['siteA', 'siteB', 'siteC'] as const`, `type SiteConfig = { key: string; parser: (typeof PARSER_NAMES)[number]; listUrl: string; vendorId: string | null }`
  - `parseSitesConfig(json: unknown): SiteConfig[]`（不正なら `Error` を投げる）
  - `MAX_LIST_PAGES = 50`
  - `crawlSite(site: SiteConfig, parser: SiteParser, load: (url: string) => Promise<string>): Promise<{ works: ParsedWork[]; failed: string[] }>`
  - `sqlValue(value: string | number | null): string`, `workUpsertSql(work: ParsedWork, id: string): string`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/works/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { parseSitesConfig } from './config'

const site = { key: 'siteA', parser: 'siteA', listUrl: 'https://example.com/case/', vendorId: null }

describe('parseSitesConfig', () => {
  it('accepts a list of sites', () => {
    expect(parseSitesConfig({ sites: [site] })).toEqual([site])
  })

  it('defaults a missing vendorId to null', () => {
    const { vendorId: _omit, ...rest } = site
    expect(parseSitesConfig({ sites: [rest] })[0]?.vendorId).toBeNull()
  })

  it.each([
    ['not an object', null],
    ['no sites', {}],
    ['empty sites', { sites: [] }],
    ['unknown parser', { sites: [{ ...site, parser: 'siteZ' }] }],
    ['http list url', { sites: [{ ...site, listUrl: 'http://example.com/' }] }],
    ['empty key', { sites: [{ ...site, key: '' }] }],
    ['duplicate key', { sites: [site, site] }],
  ])('rejects %s', (_name, input) => {
    expect(() => parseSitesConfig(input)).toThrow(/works-sites\.json/)
  })
})
```

`src/lib/works/crawl.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { crawlSite, MAX_LIST_PAGES } from './crawl'
import type { SiteParser } from './types'

const site = {
  key: 'siteA',
  parser: 'siteA' as const,
  listUrl: 'https://example.com/works/',
  vendorId: '00000000-0000-4000-8000-000000000001',
}

/** Fake pages: "list:<detail urls>|<page urls>" and "detail:<layout>" */
const parser: SiteParser = {
  parseList(html) {
    const [details = '', pages = ''] = html.replace('list:', '').split('|')
    return {
      entries: details
        .split(',')
        .filter(Boolean)
        .map((url) => ({ url, title: `T ${url}`, category: '新築' })),
      pageUrls: pages.split(',').filter(Boolean),
    }
  },
  parseDetail(html) {
    return { layout: html.replace('detail:', ''), category: null }
  },
}

function loader(pages: Record<string, string>) {
  const calls: string[] = []
  return {
    calls,
    load: async (url: string) => {
      calls.push(url)
      const body = pages[url]
      if (body === undefined) throw new Error(`fetch failed: ${url}`)
      return body
    },
  }
}

describe('crawlSite', () => {
  it('walks every list page once and merges list and detail fields', async () => {
    const { load, calls } = loader({
      'https://example.com/works/': 'list:d1,d2|https://example.com/works/page/2/',
      'https://example.com/works/page/2/': 'list:d2,d3|https://example.com/works/',
      d1: 'detail:1LDK',
      d2: 'detail:2LDK',
      d3: 'detail:3LDK',
    })
    const result = await crawlSite(site, parser, load)
    expect(result.failed).toEqual([])
    expect(result.works.map((w) => [w.sourceUrl, w.sortOrder, w.layout])).toEqual([
      ['d1', 0, '1LDK'],
      ['d2', 1, '2LDK'],
      ['d3', 2, '3LDK'],
    ])
    expect(calls.filter((u) => u === 'd2')).toHaveLength(1)
    expect(calls.filter((u) => u === 'https://example.com/works/')).toHaveLength(1)
  })

  it('fills the site, the vendor and empty defaults, and a null detail value does not erase the list value', async () => {
    const { load } = loader({ 'https://example.com/works/': 'list:d1|', d1: 'detail:1LDK' })
    const [work] = (await crawlSite(site, parser, load)).works
    expect(work).toMatchObject({
      site: 'siteA',
      vendorId: site.vendorId,
      title: 'T d1',
      category: '新築',
      points: [],
      uaValue: null,
    })
  })

  it('leaves out a work whose detail page failed, so the import cannot blank it', async () => {
    const { load } = loader({ 'https://example.com/works/': 'list:d1,d2|', d2: 'detail:2LDK' })
    const result = await crawlSite(site, parser, load)
    expect(result.works.map((w) => w.sourceUrl)).toEqual(['d2'])
    expect(result.failed).toEqual(['d1'])
  })

  it('reports a failed list page and keeps going', async () => {
    const { load } = loader({
      'https://example.com/works/': 'list:d1|https://example.com/works/page/2/',
      d1: 'detail:1LDK',
    })
    const result = await crawlSite(site, parser, load)
    expect(result.works).toHaveLength(1)
    expect(result.failed).toEqual(['https://example.com/works/page/2/'])
  })

  it('stops after MAX_LIST_PAGES even when every page links to a new one', async () => {
    let n = 0
    const endless: SiteParser = {
      parseList: () => ({ entries: [], pageUrls: [`https://example.com/works/page/${++n}/`] }),
      parseDetail: () => ({}),
    }
    const calls: string[] = []
    await crawlSite(site, endless, async (url) => {
      calls.push(url)
      return ''
    })
    expect(calls).toHaveLength(MAX_LIST_PAGES)
  })
})
```

`src/lib/works/sql.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { sqlValue, workUpsertSql } from './sql'
import { EMPTY_FIELDS, type ParsedWork } from './types'

const work: ParsedWork = {
  ...EMPTY_FIELDS,
  title: "O'Test\nの家",
  sourceUrl: 'https://example.com/works/p1/',
  site: 'siteC',
  vendorId: null,
  sortOrder: 3,
  points: ['UA値0.31', "it's"],
  uaValue: 0.31,
  floorAreaTsubo: 30.25,
  youtubeVideoId: 'abcdefghijk',
}

describe('sqlValue', () => {
  it('quotes strings, doubles single quotes and folds line breaks', () => {
    expect(sqlValue("a'b\r\nc")).toBe("'a''b c'")
  })

  it('writes numbers and null bare', () => {
    expect(sqlValue(0.31)).toBe('0.31')
    expect(sqlValue(null)).toBe('NULL')
  })
})

describe('workUpsertSql', () => {
  const sql = workUpsertSql(work, '00000000-0000-4000-8000-000000000009')

  it('is a single line ending with a semicolon', () => {
    expect(sql).not.toMatch(/[\r\n]/)
    expect(sql.endsWith(';')).toBe(true)
  })

  it('inserts the values with the points as JSON', () => {
    expect(sql).toContain("'O''Test の家'")
    expect(sql).toContain(`'["UA値0.31","it''s"]'`)
    expect(sql).toContain('ON CONFLICT(source_url) DO UPDATE SET')
  })

  it('never updates id, created_at, the watched columns or video_source', () => {
    const update = sql.slice(sql.indexOf('DO UPDATE SET'))
    for (const column of ['id =', 'created_at', 'watched_at', 'watched_by', 'video_source =']) {
      expect(update).not.toContain(column)
    }
  })

  it('keeps a manual video on conflict', () => {
    expect(sql).toContain(
      "youtube_video_id = CASE WHEN works.video_source = 'manual' THEN works.youtube_video_id ELSE excluded.youtube_video_id END",
    )
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/lib/works`
Expected: FAIL（`./config` `./crawl` `./sql` が無い）

- [ ] **Step 3: 設定の検証を実装する**

`src/lib/works/config.ts`:

```ts
export const PARSER_NAMES = ['siteA', 'siteB', 'siteC'] as const

export type SiteConfig = {
  /** Stored in works.site */
  key: string
  parser: (typeof PARSER_NAMES)[number]
  /** First list page. https only */
  listUrl: string
  /** vendors.id to link the works to, or null */
  vendorId: string | null
}

function fail(reason: string): never {
  throw new Error(`seed.local/works-sites.json: ${reason}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Validates seed.local/works-sites.json (gitignored: which sites are imported is real data and
 * is not written in the repository).
 * Shape: { "sites": [{ "key", "parser", "listUrl", "vendorId"? }] }
 */
export function parseSitesConfig(json: unknown): SiteConfig[] {
  if (!isRecord(json) || !Array.isArray(json.sites) || json.sites.length === 0) {
    fail('expected { "sites": [ ... ] } with at least one site')
  }
  const seen = new Set<string>()
  return (json.sites as unknown[]).map((raw, i) => {
    if (!isRecord(raw)) fail(`sites[${i}] is not an object`)
    const { key, parser, listUrl, vendorId = null } = raw
    if (typeof key !== 'string' || key === '' || seen.has(key)) {
      fail(`sites[${i}].key must be a unique, non-empty string`)
    }
    seen.add(key)
    const parserName = PARSER_NAMES.find((name) => name === parser)
    if (!parserName) fail(`sites[${i}].parser must be one of ${PARSER_NAMES.join(', ')}`)
    if (typeof listUrl !== 'string' || !listUrl.startsWith('https://')) {
      fail(`sites[${i}].listUrl must start with https://`)
    }
    if (vendorId !== null && typeof vendorId !== 'string') {
      fail(`sites[${i}].vendorId must be a string or null`)
    }
    return { key, parser: parserName, listUrl, vendorId }
  })
}
```

`config.test.ts` に、`sites[0]` がオブジェクトでない場合と `vendorId` が数値の場合の 2 行を `it.each` の表に足す:

```ts
    ['non-object site', { sites: ['x'] }],
    ['numeric vendorId', { sites: [{ ...site, vendorId: 1 }] }],
```

- [ ] **Step 4: 巡回を実装する**

`src/lib/works/crawl.ts`:

```ts
import type { SiteConfig } from './config'
import { EMPTY_FIELDS, type ParsedWork, type SiteParser, type WorkFields, type WorkListEntry } from './types'

/** A list never has this many pages; the cap only stops a pagination that loops */
export const MAX_LIST_PAGES = 50

/** Detail values win, except that a null (or an empty list) does not erase what the list page gave */
function merge(entry: WorkListEntry, detail: Partial<WorkFields>): WorkFields {
  const { url: _url, ...fromList } = entry
  const merged: Record<string, unknown> = { ...EMPTY_FIELDS, ...fromList }
  for (const [key, value] of Object.entries(detail)) {
    if (value === null || (Array.isArray(value) && value.length === 0)) continue
    merged[key] = value
  }
  return merged as WorkFields
}

/**
 * Reads one site: every list page, then every detail page, through `load` (the script passes a
 * cached, rate-limited fetch). A work whose detail page could not be read is left out rather
 * than written half-empty, because the generated upsert would blank the columns it already has.
 */
export async function crawlSite(
  site: SiteConfig,
  parser: SiteParser,
  load: (url: string) => Promise<string>,
): Promise<{ works: ParsedWork[]; failed: string[] }> {
  const failed: string[] = []
  const entries = new Map<string, WorkListEntry>()
  const queue = [site.listUrl]
  const visited = new Set<string>()

  while (queue.length > 0 && visited.size < MAX_LIST_PAGES) {
    const pageUrl = queue.shift() as string
    if (visited.has(pageUrl)) continue
    visited.add(pageUrl)
    try {
      const page = parser.parseList(await load(pageUrl), pageUrl)
      for (const entry of page.entries) {
        if (!entries.has(entry.url)) entries.set(entry.url, entry)
      }
      queue.push(...page.pageUrls)
    } catch {
      failed.push(pageUrl)
    }
  }

  const works: ParsedWork[] = []
  let sortOrder = 0
  for (const entry of entries.values()) {
    const order = sortOrder++
    try {
      const fields = merge(entry, parser.parseDetail(await load(entry.url)))
      works.push({
        ...fields,
        title: fields.title ?? entry.url,
        sourceUrl: entry.url,
        site: site.key,
        vendorId: site.vendorId,
        sortOrder: order,
      })
    } catch {
      failed.push(entry.url)
    }
  }
  return { works, failed }
}
```

`fields.title ?? entry.url` の右側（一覧に名前が無い場合）を通すテストを `crawl.test.ts` に足す:

```ts
  it('falls back to the url when neither page gives a title', async () => {
    const untitled: SiteParser = {
      parseList: () => ({ entries: [{ url: 'd1' }], pageUrls: [] }),
      parseDetail: () => ({ points: [] }),
    }
    const result = await crawlSite(site, untitled, async () => '')
    expect(result.works[0]?.title).toBe('d1')
  })
```

- [ ] **Step 5: SQL の生成を実装する**

`src/lib/works/sql.ts`:

```ts
import type { ParsedWork } from './types'

/** A SQL literal on one line (line breaks become a space: the output is one statement per line) */
export function sqlValue(value: string | number | null): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${value.replace(/\s*[\r\n]+\s*/g, ' ').replaceAll("'", "''")}'`
}

/** Columns the site decides. Everything else (id, created_at, watched_*, video_source) is the app's */
const SITE_COLUMNS = [
  'site',
  'vendor_id',
  'title',
  'category',
  'location',
  'completed_on',
  'points',
  'ua_value',
  'c_value',
  'family',
  'site_area_tsubo',
  'floor_area_tsubo',
  'total_area_tsubo',
  'layout',
  'sort_order',
] as const

/**
 * Upsert of one work keyed by source_url. Re-running never touches the watched flag, and a
 * video pasted by hand (video_source = 'manual') is kept over the site's.
 */
export function workUpsertSql(work: ParsedWork, id: string): string {
  const values: Record<(typeof SITE_COLUMNS)[number], string | number | null> = {
    site: work.site,
    vendor_id: work.vendorId,
    title: work.title,
    category: work.category,
    location: work.location,
    completed_on: work.completedOn,
    points: JSON.stringify(work.points),
    ua_value: work.uaValue,
    c_value: work.cValue,
    family: work.family,
    site_area_tsubo: work.siteAreaTsubo,
    floor_area_tsubo: work.floorAreaTsubo,
    total_area_tsubo: work.totalAreaTsubo,
    layout: work.layout,
    sort_order: work.sortOrder,
  }
  const columns = ['id', 'source_url', ...SITE_COLUMNS, 'youtube_video_id']
  const literals = [
    sqlValue(id),
    sqlValue(work.sourceUrl),
    ...SITE_COLUMNS.map((c) => sqlValue(values[c])),
    sqlValue(work.youtubeVideoId),
  ]
  const updates = [
    ...SITE_COLUMNS.map((c) => `${c} = excluded.${c}`),
    "youtube_video_id = CASE WHEN works.video_source = 'manual' THEN works.youtube_video_id ELSE excluded.youtube_video_id END",
    "updated_at = datetime('now')",
  ]
  return (
    `INSERT INTO works (${columns.join(', ')}) VALUES (${literals.join(', ')}) ` +
    `ON CONFLICT(source_url) DO UPDATE SET ${updates.join(', ')};`
  )
}
```

- [ ] **Step 6: lib のテストとカバレッジを確かめる**

Run: `npx vitest run src/lib/works && npm run test:coverage`
Expected: PASS・100%

- [ ] **Step 7: 生成した SQL を実 D1 に 2 回流すテストを足す（Review Focus 3）**

`src/server/repository/works.worker-test.ts` の import に足す:

```ts
import { env } from 'cloudflare:test'

import { workUpsertSql } from '../../lib/works/sql'
import { EMPTY_FIELDS, type ParsedWork } from '../../lib/works/types'
```

`describe` の中に足す:

```ts
  it('re-importing keeps the watched flag and a manual video, and refreshes the site columns', async () => {
    const parsed: ParsedWork = {
      ...EMPTY_FIELDS,
      title: "テスト's 家",
      sourceUrl: 'https://example.com/works/p1/',
      site: 'siteC',
      vendorId: null,
      sortOrder: 0,
      points: ['UA値0.31'],
      youtubeVideoId: 'siteVideo01',
    }
    await env.DB.exec(workUpsertSql(parsed, '00000000-0000-4000-8000-000000000009'))
    const [first] = await db.select().from(works)
    expect(first?.points).toEqual(['UA値0.31'])
    expect(first?.youtubeVideoId).toBe('siteVideo01')

    await setWorkWatched(db, first!.id, true, actor)
    await setWorkVideo(db, first!.id, 'manualVid01')

    // A second run generates a new id and new site values for the same source_url
    await env.DB.exec(
      workUpsertSql(
        { ...parsed, title: '改名した家', youtubeVideoId: 'siteVideo02', sortOrder: 4 },
        '00000000-0000-4000-8000-00000000000a',
      ),
    )
    const rows = await db.select().from(works)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: first!.id,
      title: '改名した家',
      sortOrder: 4,
      youtubeVideoId: 'manualVid01',
      videoSource: 'manual',
      watchedBy: actor,
    })
    expect(rows[0]?.watchedAt).not.toBeNull()
  })

  it('re-importing replaces a video that came from the site', async () => {
    const parsed: ParsedWork = {
      ...EMPTY_FIELDS,
      title: 'テストの家',
      sourceUrl: 'https://example.com/works/p2/',
      site: 'siteC',
      vendorId: null,
      sortOrder: 0,
      youtubeVideoId: 'siteVideo01',
    }
    await env.DB.exec(workUpsertSql(parsed, crypto.randomUUID()))
    await env.DB.exec(workUpsertSql({ ...parsed, youtubeVideoId: 'siteVideo02' }, crypto.randomUUID()))
    const [row] = await db.select().from(works)
    expect(row?.youtubeVideoId).toBe('siteVideo02')
  })
```

Run: `npx vitest run --config vitest.workers.config.ts src/server/repository/works.worker-test.ts`
Expected: PASS（7 件）

- [ ] **Step 8: スクリプトを書く**

`scripts/import-works.ts`:

```ts
/**
 * Reads the built examples on the vendors' sites and turns them into SQL
 * (docs/superpowers/specs/2026-10-01-works-list-design.md §4).
 *
 *   npm run import:works            # uses the cached pages when there are any
 *   npm run import:works -- --refresh   # fetches every page again
 *
 * Which sites are read is in seed.local/works-sites.json (gitignored: it is real data):
 *   { "sites": [{ "key": "siteA", "parser": "siteA", "listUrl": "https://...", "vendorId": "<vendors.id or null>" }] }
 *
 * Output: seed.local/out/works-YYYYMMDD.sql. The owner runs it against the production D1:
 *   npx wrangler d1 execute sumai-log --remote --file seed.local/out/works-YYYYMMDD.sql
 * The upsert is keyed by source_url, so re-running is safe (watched flags and videos pasted by
 * hand are kept). Titles and values are never printed, only counts.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseSitesConfig } from '../src/lib/works/config.ts'
import { crawlSite } from '../src/lib/works/crawl.ts'
import { siteA } from '../src/lib/works/siteA.ts'
import { siteB } from '../src/lib/works/siteB.ts'
import { siteC } from '../src/lib/works/siteC.ts'
import { workUpsertSql } from '../src/lib/works/sql.ts'
import type { ParsedWork } from '../src/lib/works/types.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_PATH = resolve(root, 'seed.local/works-sites.json')
const CACHE_DIR = resolve(root, 'seed.local/cache/works')
const OUT_DIR = resolve(root, 'seed.local/out')
const PARSERS = { siteA, siteB, siteC }

/** Pause between two network requests: these are small sites, read them slowly and one at a time */
const REQUEST_GAP_MS = 1000
const REQUEST_TIMEOUT_MS = 30_000
const USER_AGENT = 'Mozilla/5.0 (sumai-log works import; personal use)'

const refresh = process.argv.includes('--refresh')
let lastRequestAt = 0

async function load(url: string): Promise<string> {
  const cachePath = resolve(CACHE_DIR, `${createHash('sha1').update(url).digest('hex')}.html`)
  if (!refresh && existsSync(cachePath)) return readFileSync(cachePath, 'utf8')

  const wait = lastRequestAt + REQUEST_GAP_MS - Date.now()
  if (wait > 0) await new Promise((done) => setTimeout(done, wait))
  lastRequestAt = Date.now()

  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = new TextDecoder('utf-8').decode(await res.arrayBuffer())
  writeFileSync(cachePath, html)
  return html
}

function countFilled(works: ParsedWork[]) {
  const has = (pick: (w: ParsedWork) => unknown) => works.filter((w) => pick(w) != null).length
  return {
    works: works.length,
    video: has((w) => w.youtubeVideoId),
    points: works.filter((w) => w.points.length > 0).length,
    ua: has((w) => w.uaValue),
    c: has((w) => w.cValue),
    family: has((w) => w.family),
    floorArea: has((w) => w.floorAreaTsubo),
    layout: has((w) => w.layout),
    completedOn: has((w) => w.completedOn),
  }
}

async function main() {
  if (!existsSync(CONFIG_PATH)) {
    console.error(
      'Missing seed.local/works-sites.json. Create it as:\n' +
        '{ "sites": [{ "key": "siteA", "parser": "siteA", "listUrl": "https://...", "vendorId": null }] }',
    )
    process.exit(1)
  }
  const sites = parseSitesConfig(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')))
  mkdirSync(CACHE_DIR, { recursive: true })
  mkdirSync(OUT_DIR, { recursive: true })

  // No BEGIN / COMMIT: `wrangler d1 execute --file` already runs the file atomically
  const lines = ['-- generated by scripts/import-works.ts']
  let failedCount = 0

  for (const site of sites) {
    const { works, failed } = await crawlSite(site, PARSERS[site.parser], load)
    for (const work of works) lines.push(workUpsertSql(work, crypto.randomUUID()))
    failedCount += failed.length
    console.log(`${site.key}:`, JSON.stringify(countFilled(works)), `failed pages: ${failed.length}`)
    // The urls are real data but stay on the owner's terminal; they are needed to retry
    for (const url of failed) console.log(`  failed: ${url}`)
  }

  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const outPath = resolve(OUT_DIR, `works-${stamp}.sql`)
  writeFileSync(outPath, `${lines.join('\n')}\n`)
  console.log(`wrote ${lines.length - 1} statements to ${outPath}`)
  if (failedCount > 0) process.exit(1)
}

await main()
```

`package.json` の scripts の `"import:mbox"` の次に `"import:works": "tsx scripts/import-works.ts"` を足す（前の行の末尾にカンマ）。

- [ ] **Step 9: スクリプトを設定なしで動かして案内が出ることを確かめる**

Run: `mv seed.local/works-sites.json /tmp/ 2>/dev/null; npm run import:works; echo "exit=$?"`
Expected: `Missing seed.local/works-sites.json. Create it as:` と書式が出て `exit=1`。（退避したファイルがあれば戻す）

実サイトでの確認は Task 11 で本人の設定ファイルを使って行う。

- [ ] **Step 10: コミット**

```bash
npm run typecheck && npm run format:check && npm run check:pii
git add src/lib/works scripts/import-works.ts package.json src/server/repository/works.worker-test.ts
git commit -m "feat(works): 施工例を取り込む SQL を生成するスクリプト"
```

---

### Task 7: 絞り込み・揃えた表示の中身・視聴判定（純粋関数）

**Files:**
- Create: `src/lib/works/filter.ts` `src/lib/works/watch.ts`
- Test: `src/lib/works/filter.test.ts` `src/lib/works/watch.test.ts`

**Interfaces:**
- Produces（`filter.ts`。`WorkLike` は `Work` の一部だけを要求するので `src/db/schema` を import しない）:
  - `type WorkFilter = { vendorId?: string; hasVideo?: boolean; unwatched?: boolean }`
  - `filterWorks<T extends { vendorId: string | null; youtubeVideoId: string | null; watchedAt: string | null }>(works: T[], filter: WorkFilter): T[]`
  - `watchedSummary(works): { total: number; withVideo: number; watched: number }`
  - `vendorOptions(works: { vendorId: string | null; vendorName: string | null }[]): { id: string; name: string }[]`
  - `formatTsubo(value: number): string`（`50.5坪`）
  - `specOf(work): WorkSpec` — `type WorkSpec = { points: string[]; family: string | null; areas: { label: string; value: string }[]; layout: string | null; isEmpty: boolean }`
- Produces（`watch.ts`）:
  - `YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com'`
  - `LISTENING_MESSAGE: string`
  - `type PlayerInfo = { currentTime: number; duration: number; playerState: number }`, `EMPTY_PLAYER_INFO`
  - `readPlayerMessage(raw: unknown): Partial<PlayerInfo> | null`
  - `mergePlayerInfo(prev: PlayerInfo, patch: Partial<PlayerInfo>): PlayerInfo`
  - `shouldMarkWatched(info: PlayerInfo): boolean`
  - `embedUrl(videoId: string, origin: string): string`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/works/filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { filterWorks, formatTsubo, specOf, vendorOptions, watchedSummary } from './filter'

const base = {
  vendorId: null as string | null,
  vendorName: null as string | null,
  youtubeVideoId: null as string | null,
  watchedAt: null as string | null,
  points: [] as string[],
  family: null as string | null,
  siteAreaTsubo: null as number | null,
  floorAreaTsubo: null as number | null,
  totalAreaTsubo: null as number | null,
  layout: null as string | null,
}
const works = [
  { ...base, id: 'a', vendorId: 'v1', vendorName: '甲工務店', youtubeVideoId: 'abcdefghijk' },
  { ...base, id: 'b', vendorId: 'v1', vendorName: '甲工務店', youtubeVideoId: 'abcdefghijk', watchedAt: '2026-10-01T00:00:00.000Z' },
  { ...base, id: 'c', vendorId: 'v2', vendorName: '乙建設' },
  { ...base, id: 'd' },
]

describe('filterWorks', () => {
  it('returns everything without a filter', () => {
    expect(filterWorks(works, {})).toHaveLength(4)
  })

  it('filters by vendor, by having a video, and by not being watched', () => {
    expect(filterWorks(works, { vendorId: 'v1' }).map((w) => w.id)).toEqual(['a', 'b'])
    expect(filterWorks(works, { hasVideo: true }).map((w) => w.id)).toEqual(['a', 'b'])
    expect(filterWorks(works, { unwatched: true }).map((w) => w.id)).toEqual(['a', 'c', 'd'])
    expect(filterWorks(works, { vendorId: 'v1', hasVideo: true, unwatched: true }).map((w) => w.id)).toEqual(['a'])
  })
})

describe('watchedSummary', () => {
  it('counts the total, those with a video and those watched', () => {
    expect(watchedSummary(works)).toEqual({ total: 4, withVideo: 2, watched: 1 })
  })
})

describe('vendorOptions', () => {
  it('lists each vendor once in first-seen order, leaving out works without a vendor', () => {
    expect(vendorOptions(works)).toEqual([
      { id: 'v1', name: '甲工務店' },
      { id: 'v2', name: '乙建設' },
    ])
  })

  it('leaves out a vendor id whose name is missing', () => {
    expect(vendorOptions([{ vendorId: 'v9', vendorName: null }])).toEqual([])
  })
})

describe('formatTsubo', () => {
  it('drops trailing zeros and keeps at most 2 decimals', () => {
    expect(formatTsubo(50.5)).toBe('50.5坪')
    expect(formatTsubo(33.15)).toBe('33.15坪')
    expect(formatTsubo(30)).toBe('30坪')
  })
})

describe('specOf', () => {
  it('orders the areas as site, floor, total and leaves out the missing ones', () => {
    const spec = specOf({
      ...base,
      points: ['UA値0.31'],
      family: '大人2人',
      siteAreaTsubo: 50.5,
      totalAreaTsubo: 33.15,
      layout: '3LDK',
    })
    expect(spec).toEqual({
      points: ['UA値0.31'],
      family: '大人2人',
      areas: [
        { label: '敷地面積', value: '50.5坪' },
        { label: '総施工面積', value: '33.15坪' },
      ],
      layout: '3LDK',
      isEmpty: false,
    })
  })

  it('is empty when the site gave none of the four', () => {
    expect(specOf(base).isEmpty).toBe(true)
  })

  it.each([
    ['points', { points: ['耐震等級3'] }],
    ['family', { family: '大人2人' }],
    ['area', { floorAreaTsubo: 30 }],
    ['layout', { layout: '2LDK' }],
  ])('is not empty with only %s', (_name, over) => {
    expect(specOf({ ...base, ...over }).isEmpty).toBe(false)
  })
})
```

`src/lib/works/watch.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  EMPTY_PLAYER_INFO,
  LISTENING_MESSAGE,
  YOUTUBE_EMBED_ORIGIN,
  embedUrl,
  mergePlayerInfo,
  readPlayerMessage,
  shouldMarkWatched,
} from './watch'

describe('readPlayerMessage', () => {
  it('reads the numbers of an infoDelivery message sent as a JSON string', () => {
    const raw = JSON.stringify({
      event: 'infoDelivery',
      info: { currentTime: 12.5, duration: 600, playerState: 1, videoData: { title: 'x' } },
    })
    expect(readPlayerMessage(raw)).toEqual({ currentTime: 12.5, duration: 600, playerState: 1 })
  })

  it('reads a partial infoDelivery (the player usually sends only what changed)', () => {
    expect(readPlayerMessage(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 3 } }))).toEqual({
      currentTime: 3,
    })
  })

  it('reads initialDelivery the same way, and onStateChange as the player state', () => {
    expect(readPlayerMessage(JSON.stringify({ event: 'initialDelivery', info: { duration: 90 } }))).toEqual({
      duration: 90,
    })
    expect(readPlayerMessage(JSON.stringify({ event: 'onStateChange', info: 0 }))).toEqual({
      playerState: 0,
    })
  })

  it.each([
    ['not a string', { event: 'infoDelivery' }],
    ['not JSON', 'hello'],
    ['JSON that is not an object', '5'],
    ['JSON null', 'null'],
    ['another event', JSON.stringify({ event: 'onReady' })],
    ['infoDelivery without info', JSON.stringify({ event: 'infoDelivery', info: null })],
    ['infoDelivery with a non-object info', JSON.stringify({ event: 'infoDelivery', info: 5 })],
    ['onStateChange without a number', JSON.stringify({ event: 'onStateChange', info: 'x' })],
    ['non-finite numbers only', JSON.stringify({ event: 'infoDelivery', info: { currentTime: 'x' } })],
  ])('returns null for %s', (_name, raw) => {
    expect(readPlayerMessage(raw)).toBeNull()
  })
})

describe('mergePlayerInfo', () => {
  it('keeps what the patch does not carry', () => {
    const first = mergePlayerInfo(EMPTY_PLAYER_INFO, { duration: 600 })
    expect(mergePlayerInfo(first, { currentTime: 30 })).toEqual({
      currentTime: 30,
      duration: 600,
      playerState: -1,
    })
  })
})

describe('shouldMarkWatched', () => {
  it('is true at 90% of the length', () => {
    expect(shouldMarkWatched({ currentTime: 540, duration: 600, playerState: 1 })).toBe(true)
    expect(shouldMarkWatched({ currentTime: 539, duration: 600, playerState: 1 })).toBe(false)
  })

  it('is true when the player reports the end, whatever the position', () => {
    expect(shouldMarkWatched({ currentTime: 0, duration: 0, playerState: 0 })).toBe(true)
  })

  it('is false while the length is unknown (a live stream, or before the first message)', () => {
    expect(shouldMarkWatched({ currentTime: 50, duration: 0, playerState: 1 })).toBe(false)
    expect(shouldMarkWatched(EMPTY_PLAYER_INFO)).toBe(false)
  })
})

describe('embedUrl', () => {
  it('points at the no-cookie host with the JS API on and the page origin', () => {
    expect(embedUrl('abcdefghijk', 'https://example.test')).toBe(
      'https://www.youtube-nocookie.com/embed/abcdefghijk?enablejsapi=1&playsinline=1&rel=0&origin=https%3A%2F%2Fexample.test',
    )
    expect(YOUTUBE_EMBED_ORIGIN).toBe('https://www.youtube-nocookie.com')
  })

  it('has a listening message the player understands', () => {
    expect(JSON.parse(LISTENING_MESSAGE)).toEqual({ event: 'listening', id: 'sumai-log', channel: 'widget' })
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/lib/works/filter.test.ts src/lib/works/watch.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/lib/works/filter.ts`:

```ts
/**
 * Filtering and the aligned "Data" view of the works page (/works). The types ask only for
 * the columns each function reads, so this file does not depend on the DB schema.
 */

export type WorkFilter = { vendorId?: string; hasVideo?: boolean; unwatched?: boolean }

type Filterable = { vendorId: string | null; youtubeVideoId: string | null; watchedAt: string | null }

export function filterWorks<T extends Filterable>(works: T[], filter: WorkFilter): T[] {
  return works.filter(
    (w) =>
      (!filter.vendorId || w.vendorId === filter.vendorId) &&
      (!filter.hasVideo || w.youtubeVideoId !== null) &&
      (!filter.unwatched || w.watchedAt === null),
  )
}

export function watchedSummary(works: Pick<Filterable, 'youtubeVideoId' | 'watchedAt'>[]) {
  return {
    total: works.length,
    withVideo: works.filter((w) => w.youtubeVideoId !== null).length,
    watched: works.filter((w) => w.watchedAt !== null).length,
  }
}

/** Vendors that have at least one work, in the order they first appear */
export function vendorOptions(
  works: { vendorId: string | null; vendorName: string | null }[],
): { id: string; name: string }[] {
  const options = new Map<string, string>()
  for (const { vendorId, vendorName } of works) {
    if (vendorId && vendorName && !options.has(vendorId)) options.set(vendorId, vendorName)
  }
  return [...options].map(([id, name]) => ({ id, name }))
}

/** 50.5 -> '50.5坪' (at most 2 decimals, no trailing zeros) */
export function formatTsubo(value: number): string {
  return `${Number(value.toFixed(2))}坪`
}

export type WorkSpec = {
  points: string[]
  family: string | null
  /** Site, floor, total: in this order, only those the site gave */
  areas: { label: string; value: string }[]
  layout: string | null
  /** None of the four blocks has a value */
  isEmpty: boolean
}

type SpecSource = {
  points: string[]
  family: string | null
  siteAreaTsubo: number | null
  floorAreaTsubo: number | null
  totalAreaTsubo: number | null
  layout: string | null
}

/** The four blocks of the aligned view, in the fixed order: points, family, area, layout */
export function specOf(work: SpecSource): WorkSpec {
  const areas = [
    { label: '敷地面積', tsubo: work.siteAreaTsubo },
    { label: '延床面積', tsubo: work.floorAreaTsubo },
    { label: '総施工面積', tsubo: work.totalAreaTsubo },
  ].flatMap(({ label, tsubo }) => (tsubo === null ? [] : [{ label, value: formatTsubo(tsubo) }]))
  return {
    points: work.points,
    family: work.family,
    areas,
    layout: work.layout,
    isEmpty:
      work.points.length === 0 && work.family === null && areas.length === 0 && work.layout === null,
  }
}
```

`src/lib/works/watch.ts`:

```ts
/**
 * Watching a tour video inside the app (/works). The embedded player is driven without
 * loading YouTube's script: after the page posts LISTENING_MESSAGE to the iframe, the player
 * posts its state back as JSON strings, and these functions read them.
 */

export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com'

/** Asks the embedded player to start posting its state to this window */
export const LISTENING_MESSAGE = JSON.stringify({
  event: 'listening',
  id: 'sumai-log',
  channel: 'widget',
})

/** playerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering */
export type PlayerInfo = { currentTime: number; duration: number; playerState: number }

export const EMPTY_PLAYER_INFO: PlayerInfo = { currentTime: 0, duration: 0, playerState: -1 }

const INFO_KEYS = ['currentTime', 'duration', 'playerState'] as const

/** The numbers carried by one message from the player, or null when it is not one of ours */
export function readPlayerMessage(raw: unknown): Partial<PlayerInfo> | null {
  if (typeof raw !== 'string') return null
  let message: unknown
  try {
    message = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof message !== 'object' || message === null) return null
  const { event, info } = message as { event?: unknown; info?: unknown }

  if (event === 'onStateChange') {
    return typeof info === 'number' ? { playerState: info } : null
  }
  if ((event !== 'infoDelivery' && event !== 'initialDelivery') || typeof info !== 'object' || !info) {
    return null
  }
  const patch: Partial<PlayerInfo> = {}
  for (const key of INFO_KEYS) {
    const value = (info as Record<string, unknown>)[key]
    if (typeof value === 'number' && Number.isFinite(value)) patch[key] = value
  }
  return Object.keys(patch).length > 0 ? patch : null
}

export function mergePlayerInfo(prev: PlayerInfo, patch: Partial<PlayerInfo>): PlayerInfo {
  return { ...prev, ...patch }
}

/** Watched = the player reported the end, or the position reached 90% of a known length */
export function shouldMarkWatched(info: PlayerInfo): boolean {
  if (info.playerState === 0) return true
  return info.duration > 0 && info.currentTime / info.duration >= 0.9
}

export function embedUrl(videoId: string, origin: string): string {
  const params = new URLSearchParams({ enablejsapi: '1', playsinline: '1', rel: '0', origin })
  return `${YOUTUBE_EMBED_ORIGIN}/embed/${videoId}?${params}`
}
```

- [ ] **Step 4: 通ることとカバレッジを確かめる**

Run: `npx vitest run src/lib/works && npm run test:coverage`
Expected: PASS・100%

- [ ] **Step 5: コミット**

```bash
git add src/lib/works/filter.ts src/lib/works/filter.test.ts src/lib/works/watch.ts src/lib/works/watch.test.ts
git commit -m "feat(works): 施工例の絞り込みと視聴判定"
```

---

### Task 8: サーバ関数

**Files:**
- Create: `src/server/works.schema.ts` `src/server/works.ts`
- Test: `src/server/works.worker-test.ts`

**Interfaces:**
- Consumes: `listWorksWithVendor` `setWorkWatched` `setWorkVideo`（Task 1）, `parseYouTubeId`（`src/lib/youtube.ts`）, `idField`（`src/server/zod.ts`）, `currentActorEmail`（`src/server/members.ts`）, `getDb`（`src/db/client`）
- Produces:
  - `workWatchedInput`（`{ id: string; watched: boolean }`）, `workVideoInput`（入力 `{ id: string; url: string | null }` → 出力 `{ id: string; videoId: string | null }`）
  - `listWorks(): Promise<WorkRow[]>`
  - `markWorkWatched({ data: { id, watched } }): Promise<{ ok: boolean }>`
  - `saveWorkVideo({ data: { id, url } }): Promise<{ ok: boolean }>`

- [ ] **Step 1: 失敗するテストを書く**

`src/server/works.worker-test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { workVideoInput, workWatchedInput } from './works.schema'

// Imported from ./works.schema, not ./works: see the comment in videos.schema.ts
const id = '00000000-0000-4000-8000-000000000001'

describe('workWatchedInput', () => {
  it('accepts an id and a boolean', () => {
    expect(workWatchedInput.safeParse({ id, watched: true }).success).toBe(true)
  })

  it('rejects a malformed id and a non-boolean', () => {
    expect(workWatchedInput.safeParse({ id: 'x', watched: true }).success).toBe(false)
    expect(workWatchedInput.safeParse({ id, watched: 'yes' }).success).toBe(false)
  })
})

describe('workVideoInput', () => {
  it.each([
    'https://www.youtube.com/watch?v=abcdefghijk',
    ' https://youtu.be/abcdefghijk?si=x ',
    'https://www.youtube.com/embed/abcdefghijk',
    'https://www.youtube.com/shorts/abcdefghijk',
  ])('normalizes %s to the video id', (url) => {
    const result = workVideoInput.safeParse({ id, url })
    expect(result.success && result.data).toEqual({ id, videoId: 'abcdefghijk' })
  })

  it('treats null and an empty string as "remove the video"', () => {
    expect(workVideoInput.parse({ id, url: null })).toEqual({ id, videoId: null })
    expect(workVideoInput.parse({ id, url: '  ' })).toEqual({ id, videoId: null })
  })

  it('rejects a URL that is not a YouTube video, with the reason on the url field', () => {
    const result = workVideoInput.safeParse({ id, url: 'https://example.com/video' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['url'])
      expect(result.error.issues[0]?.message).toBe('YouTube の URL を入れてください')
    }
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run --config vitest.workers.config.ts src/server/works.worker-test.ts`
Expected: FAIL（`./works.schema` が無い）

- [ ] **Step 3: 実装する**

`src/server/works.schema.ts`:

```ts
import { z } from 'zod'

import { parseYouTubeId } from '../lib/youtube'
import { idField } from './zod'

// Split from works.ts for the same reason as videos.schema.ts: works.ts pulls in
// currentActorEmail, which a plain workers test cannot resolve.

export const workWatchedInput = z.object({ id: idField, watched: z.boolean() })

/** A pasted YouTube URL (watch / youtu.be / embed / shorts) -> the video id. null or '' removes the video */
export const workVideoInput = z
  .object({ id: idField, url: z.string().trim().max(500).nullable() })
  .transform((v, ctx) => {
    if (!v.url) return { id: v.id, videoId: null }
    const videoId = parseYouTubeId(v.url)
    if (!videoId) {
      ctx.addIssue({ code: 'custom', message: 'YouTube の URL を入れてください', path: ['url'] })
      return z.NEVER
    }
    return { id: v.id, videoId }
  })
export type WorkVideoInput = z.input<typeof workVideoInput>
```

`src/server/works.ts`:

```ts
import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { currentActorEmail } from './members'
import { listWorksWithVendor, setWorkVideo, setWorkWatched } from './repository'
import { workVideoInput, workWatchedInput } from './works.schema'

export const listWorks = createServerFn().handler(async () => listWorksWithVendor(getDb()))

/** ok: false = the work is gone (a re-import does not delete, so this is only a stale tab) */
export const markWorkWatched = createServerFn({ method: 'POST' })
  .validator(workWatchedInput)
  .handler(async ({ data }) => ({
    ok: await setWorkWatched(getDb(), data.id, data.watched, await currentActorEmail()),
  }))

export const saveWorkVideo = createServerFn({ method: 'POST' })
  .validator(workVideoInput)
  .handler(async ({ data }) => ({ ok: await setWorkVideo(getDb(), data.id, data.videoId) }))
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run --config vitest.workers.config.ts src/server/works.worker-test.ts && npm run typecheck`
Expected: PASS・型エラーなし

- [ ] **Step 5: コミット**

```bash
git add src/server/works.schema.ts src/server/works.ts src/server/works.worker-test.ts
git commit -m "feat(works): 施工例の一覧・視聴・動画のサーバ関数"
```

---

### Task 9: `/works` の画面（一覧・揃えて見る・絞り込み・手動の視聴チェック・動画 URL を貼る）

**Files:**
- Create: `src/components/works/worksSearch.ts` `src/components/works/WorkSpecs.tsx` `src/components/works/WorkCard.tsx` `src/components/works/WorkVideoForm.tsx` `src/routes/works.tsx`
- Modify: `src/components/AppLayout.tsx`（`HEADER_LINKS` に 1 行）
- Modify: `src/components/AppLayout.ui.test.tsx`（83 行目付近のラベルの配列に `'施工例'`）
- Modify: `test/ui/fixtures.ts`（`work()`）
- Generated: `src/routeTree.gen.ts`（`npm run generate-routes`）
- Test: `src/routes/works.ui.test.tsx`

**Interfaces:**
- Consumes: `listWorks` `markWorkWatched` `saveWorkVideo`（Task 8）, `WorkRow`（Task 1）, `filterWorks` `watchedSummary` `vendorOptions` `specOf`（Task 7）, `youtubeThumbnailUrl` `parseYouTubeId` `canonicalYouTubeUrl`（`src/lib/youtube.ts`）, `PageShell` `EmptyState`
- Produces:
  - `worksSearchSchema`, `type WorksSearch = { v?: string; video?: true; unwatched?: true; view?: 'spec' }`
  - `<WorkSpecs work={WorkRow} />`（1 件ぶんの定義リスト。空なら `null`）
  - `<WorkCard work onPlay onToggleWatched onEditVideo showSpecs />`
  - `<WorkVideoForm work onSaved onCancel />`
  - Task 10 が使う: `works.tsx` 内の `playing` 状態と `setWatched(work, watched, { undo })`、`<WorkCard onPlay>`

**文言（画面に出る日本語。ここに書いたとおりに使う）:** ページ名「施工例」／説明「候補の会社の施工例をまとめて見る」／チップ「すべて」「動画あり」「まだ見ていない」／表示切替「一覧」「揃えて見る」／件数「{total} 件中 {watched} 件を視聴済み」／状態「視聴済み」／ボタン「動画を見る」「視聴済みにする」「視聴済みを取り消す」「動画の URL を貼る」「動画を変える」「動画を外す」「保存」「やめる」／リンク「{title} を元のページで開く」／空「施工例がまだありません」「取り込みが済むとここに並びます。」／絞り込みで 0 件「条件に合う施工例がありません」／失敗「保存できませんでした」。

- [ ] **Step 1: フィクスチャを足す**

`test/ui/fixtures.ts` の import の型に `Work` を足し、`video()` の後ろに:

```ts
export function work(over: Partial<Work> = {}): Work {
  return {
    id: uid(900),
    sourceUrl: 'https://example.com/works/p1/',
    site: 'siteA',
    vendorId: null,
    title: 'テストの家',
    category: '新築',
    location: null,
    completedOn: null,
    points: [],
    uaValue: null,
    cValue: null,
    family: null,
    siteAreaTsubo: null,
    floorAreaTsubo: null,
    totalAreaTsubo: null,
    layout: null,
    youtubeVideoId: null,
    videoSource: null,
    watchedAt: null,
    watchedBy: null,
    sortOrder: 0,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  }
}
```

- [ ] **Step 2: 失敗する UI テストを書く**

`src/routes/works.ui.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { listWorks, markWorkWatched, saveWorkVideo } from '../server/works'
import { mockOf, stub, uid, work } from '../../test/ui/fixtures'
import { renderRoute } from '../../test/ui/render'

function row(over: Parameters<typeof work>[0], vendorName: string | null = null) {
  return { ...work(over), vendorName }
}

const FULL = row(
  {
    id: uid(1),
    title: '全部そろった家',
    vendorId: 'v1',
    points: ['断熱性能：UA値0.31', '耐震等級3'],
    uaValue: 0.31,
    cValue: 0.6,
    family: '大人2人、子供1人',
    siteAreaTsubo: 50.5,
    floorAreaTsubo: 30.2,
    totalAreaTsubo: 33.15,
    layout: '2LDK＋書斎',
    youtubeVideoId: 'abcdefghijk',
  },
  '甲工務店',
)
const WATCHED = row(
  { id: uid(2), title: '見終わった家', vendorId: 'v1', youtubeVideoId: 'bbbbbbbbbbb', watchedAt: '2026-10-01T00:00:00.000Z', watchedBy: 'owner@example.com', sourceUrl: 'https://example.com/works/p2/' },
  '甲工務店',
)
const BARE = row(
  { id: uid(3), title: '名前だけの家', vendorId: 'v2', site: 'siteB', sourceUrl: 'https://example.com/works/p3/' },
  '乙建設',
)

describe('works route', () => {
  beforeEach(() => {
    stub(listWorks, [FULL, WATCHED, BARE])
    stub(markWorkWatched, { ok: true })
    stub(saveWorkVideo, { ok: true })
  })

  it('lists every work with its vendor, a link to the source and the watched count in words', async () => {
    await renderRoute('/works')
    expect(await screen.findByRole('heading', { name: '施工例', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('3 件中 1 件を視聴済み')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '全部そろった家 を元のページで開く' })).toHaveAttribute(
      'href',
      'https://example.com/works/p1/',
    )
    const watched = screen.getByRole('article', { name: '見終わった家' })
    expect(within(watched).getByText('視聴済み')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: '全部そろった家' })).queryByText('視聴済み')).not.toBeInTheDocument()
  })

  it('shows the empty state when nothing has been imported', async () => {
    stub(listWorks, [])
    await renderRoute('/works')
    expect(await screen.findByText('施工例がまだありません')).toBeInTheDocument()
  })

  it('filters by vendor, by video and by unwatched, keeping the filter in the URL', async () => {
    const { user, router } = await renderRoute('/works')
    await user.click(await screen.findByRole('radio', { name: '乙建設' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ v: 'v2' }))
    expect(screen.queryByText('全部そろった家')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: '動画あり' }))
    expect(await screen.findByText('条件に合う施工例がありません')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'すべて' }))
    await user.click(screen.getByRole('checkbox', { name: 'まだ見ていない' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ video: true, unwatched: true }))
    expect(screen.getByText('全部そろった家')).toBeInTheDocument()
    expect(screen.queryByText('見終わった家')).not.toBeInTheDocument()
  })

  it('falls back to no filter for an unknown search value', async () => {
    await renderRoute('/works?view=nope&video=maybe')
    expect(await screen.findByText('名前だけの家')).toBeInTheDocument()
  })

  it('shows the same four blocks in the same order in the aligned view, and no row for a missing value', async () => {
    const { user, router } = await renderRoute('/works')
    await user.click(await screen.findByRole('radio', { name: '揃えて見る' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ view: 'spec' }))

    const full = within(screen.getByRole('article', { name: '全部そろった家' }))
    const terms = full.getAllByRole('term').map((el) => el.textContent)
    expect(terms).toEqual(['ポイント', '家族構成', '面積', '間取り'])
    expect(full.getByText('断熱性能：UA値0.31')).toBeInTheDocument()
    expect(full.getByText('敷地面積 50.5坪')).toBeInTheDocument()
    expect(full.getByText('延床面積 30.2坪')).toBeInTheDocument()
    expect(full.getByText('総施工面積 33.15坪')).toBeInTheDocument()
    expect(full.getByText('2LDK＋書斎')).toBeInTheDocument()

    const bare = within(screen.getByRole('article', { name: '名前だけの家' }))
    expect(bare.queryAllByRole('term')).toEqual([])
    expect(bare.queryByText('—')).not.toBeInTheDocument()
  })

  it('marks a work as watched by hand and takes it back', async () => {
    const { user } = await renderRoute('/works')
    const full = within(await screen.findByRole('article', { name: '全部そろった家' }))
    await user.click(full.getByRole('button', { name: '視聴済みにする' }))
    await waitFor(() =>
      expect(mockOf(markWorkWatched)).toHaveBeenCalledWith({ data: { id: uid(1), watched: true } }),
    )

    const watched = within(screen.getByRole('article', { name: '見終わった家' }))
    await user.click(watched.getByRole('button', { name: '視聴済みを取り消す' }))
    await waitFor(() =>
      expect(mockOf(markWorkWatched)).toHaveBeenCalledWith({ data: { id: uid(2), watched: false } }),
    )
  })

  it('says so when saving fails', async () => {
    mockOf(markWorkWatched).mockRejectedValue(new Error('boom'))
    const { user } = await renderRoute('/works')
    const full = within(await screen.findByRole('article', { name: '全部そろった家' }))
    await user.click(full.getByRole('button', { name: '視聴済みにする' }))
    expect(await screen.findByText('保存できませんでした')).toBeInTheDocument()
  })

  it('pastes a video URL for a work without one, rejecting what is not a YouTube URL', async () => {
    const { user } = await renderRoute('/works')
    const bare = within(await screen.findByRole('article', { name: '名前だけの家' }))
    await user.click(bare.getByRole('button', { name: '動画の URL を貼る' }))

    const dialog = within(await screen.findByRole('dialog'))
    await user.type(dialog.getByRole('textbox', { name: 'YouTube の URL' }), 'https://example.com/x')
    await user.click(dialog.getByRole('button', { name: '保存' }))
    expect(await dialog.findByText('YouTube の URL を入れてください')).toBeInTheDocument()
    expect(mockOf(saveWorkVideo)).not.toHaveBeenCalled()

    await user.clear(dialog.getByRole('textbox', { name: 'YouTube の URL' }))
    await user.type(dialog.getByRole('textbox', { name: 'YouTube の URL' }), 'https://youtu.be/ccccccccccc')
    await user.click(dialog.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(mockOf(saveWorkVideo)).toHaveBeenCalledWith({
        data: { id: uid(3), url: 'https://youtu.be/ccccccccccc' },
      }),
    )
  })

  it('offers to remove a video only when it was pasted by hand', async () => {
    stub(listWorks, [row({ id: uid(4), title: '手で貼った家', youtubeVideoId: 'ddddddddddd', videoSource: 'manual' })])
    const { user } = await renderRoute('/works')
    const card = within(await screen.findByRole('article', { name: '手で貼った家' }))
    await user.click(card.getByRole('button', { name: '動画を変える' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '動画を外す' }))
    await waitFor(() =>
      expect(mockOf(saveWorkVideo)).toHaveBeenCalledWith({ data: { id: uid(4), url: null } }),
    )
  })
})
```

- [ ] **Step 3: 落ちることを確かめる**

Run: `npx vitest run --config vitest.ui.config.ts src/routes/works.ui.test.tsx`
Expected: FAIL（`/works` のルートが無い）

- [ ] **Step 4: search params の schema**

`src/components/works/worksSearch.ts`:

```ts
import { z } from 'zod'

/**
 * Filters and the view of the works page (/works). Every key falls back to "not set" on an
 * unknown value, like sourcesSearchSchema: an old or hand-typed URL shows the full list
 * instead of the error screen.
 */
export const worksSearchSchema = z.object({
  /** vendors.id */
  v: z.string().max(60).optional().catch(undefined),
  /** Only works with a tour video */
  video: z.literal(true).optional().catch(undefined),
  /** Only works not watched yet */
  unwatched: z.literal(true).optional().catch(undefined),
  /** 'spec' = the aligned view. Absent = the plain list */
  view: z.literal('spec').optional().catch(undefined),
})

export type WorksSearch = z.infer<typeof worksSearchSchema>
```

- [ ] **Step 5: 揃えた表示の 1 件ぶん**

`src/components/works/WorkSpecs.tsx`:

```tsx
import { List, Text } from '@mantine/core'

import { specOf } from '../../lib/works/filter'
import type { WorkRow } from '../../server/repository/works'

/**
 * The "Data" block of one work, always in the same order (points, family, area, layout) so
 * that works from different sites line up. A block the site did not give is left out entirely
 * rather than shown as "—" (SHIG 47).
 */
export function WorkSpecs({ work }: { work: WorkRow }) {
  const spec = specOf(work)
  if (spec.isEmpty) return null
  return (
    <dl className="work-specs">
      {spec.points.length > 0 ? (
        <>
          <dt>ポイント</dt>
          <dd>
            <List size="sm" spacing={2}>
              {spec.points.map((point) => (
                <List.Item key={point}>{point}</List.Item>
              ))}
            </List>
          </dd>
        </>
      ) : null}
      {spec.family ? (
        <>
          <dt>家族構成</dt>
          <dd>
            <Text size="sm">{spec.family}</Text>
          </dd>
        </>
      ) : null}
      {spec.areas.length > 0 ? (
        <>
          <dt>面積</dt>
          <dd>
            {spec.areas.map((area) => (
              <Text key={area.label} size="sm">
                {area.label} {area.value}
              </Text>
            ))}
          </dd>
        </>
      ) : null}
      {spec.layout ? (
        <>
          <dt>間取り</dt>
          <dd>
            <Text size="sm">{spec.layout}</Text>
          </dd>
        </>
      ) : null}
    </dl>
  )
}
```

`src/styles.css` の末尾に（スマホは縦積み、`sm` 以上は見出し列を固定幅にして全件の値の左端を揃える）:

```css
/* Works page: the aligned "Data" block. Labels share one column so values line up across cards */
.work-specs {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2px 12px;
  margin: 0;
}
.work-specs dt {
  font-size: var(--mantine-font-size-xs);
  font-weight: 700;
  margin-top: 6px;
}
.work-specs dd {
  margin: 0;
}
@media (min-width: 48em) {
  .work-specs {
    grid-template-columns: 6em 1fr;
  }
  .work-specs dt {
    font-size: var(--mantine-font-size-sm);
    margin-top: 0;
  }
}
```

設計仕様 §5 は PC を「表」としているが、ページの本文幅（`PageShell` の `Container size="sm"`＝約 720px）に 7 列は収まらない。**見出し列を固定幅にした定義リストを全幅で使い、PC でも同じ DOM にする**（値の左端が全件で揃う・スマホと PC で二重に描画しない）。この差は Task 11 の PR 説明に書く。

- [ ] **Step 6: カード**

`src/components/works/WorkCard.tsx`:

```tsx
import { Anchor, Badge, Button, Card, Group, Image, Stack, Text } from '@mantine/core'
import { Check, ExternalLink, Play } from 'lucide-react'

import { formatTsubo } from '../../lib/works/filter'
import { youtubeThumbnailUrl } from '../../lib/youtube'
import type { WorkRow } from '../../server/repository/works'
import { WorkSpecs } from './WorkSpecs'

/** Vendor, category, city and completion on one line; only what the site gave */
function metaOf(work: WorkRow): string {
  return [work.vendorName, work.category, work.location, work.completedOn?.replace('-', '/')]
    .filter(Boolean)
    .join('・')
}

/** The three numbers worth comparing at a glance in the plain list */
function headlineOf(work: WorkRow): string {
  return [
    work.floorAreaTsubo === null ? null : `延床 ${formatTsubo(work.floorAreaTsubo)}`,
    work.uaValue === null ? null : `UA値 ${work.uaValue}`,
    work.cValue === null ? null : `C値 ${work.cValue}`,
  ]
    .filter(Boolean)
    .join('　')
}

export function WorkCard({
  work,
  showSpecs,
  onPlay,
  onToggleWatched,
  onEditVideo,
}: {
  work: WorkRow
  /** true in the aligned view: the full Data block instead of the three headline numbers */
  showSpecs: boolean
  onPlay: () => void
  onToggleWatched: () => void
  onEditVideo: () => void
}) {
  const watched = work.watchedAt !== null
  const meta = metaOf(work)
  const headline = headlineOf(work)
  return (
    <Card withBorder padding="md" component="article" aria-label={work.title}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <Stack gap={2}>
            <Anchor
              href={work.sourceUrl}
              target="_blank"
              rel="noreferrer"
              fw={700}
              aria-label={`${work.title} を元のページで開く`}
            >
              {work.title} <ExternalLink size={14} aria-hidden />
            </Anchor>
            {meta ? (
              <Text size="xs" c="dimmed">
                {meta}
              </Text>
            ) : null}
          </Stack>
          {/* Not colour alone: an icon and the word (SHIG 96, 70) */}
          {watched ? (
            <Badge color="teal" variant="light" leftSection={<Check size={12} aria-hidden />}>
              視聴済み
            </Badge>
          ) : null}
        </Group>

        {work.youtubeVideoId ? (
          <Image
            src={youtubeThumbnailUrl(work.youtubeVideoId)}
            alt=""
            radius="sm"
            h={160}
            fit="cover"
            loading="lazy"
          />
        ) : null}

        {showSpecs ? <WorkSpecs work={work} /> : headline ? <Text size="sm">{headline}</Text> : null}

        <Group gap="xs">
          {work.youtubeVideoId ? (
            <Button size="sm" leftSection={<Play size={16} aria-hidden />} onClick={onPlay}>
              動画を見る
            </Button>
          ) : null}
          <Button size="sm" variant="default" onClick={onToggleWatched}>
            {watched ? '視聴済みを取り消す' : '視聴済みにする'}
          </Button>
          {!work.youtubeVideoId ? (
            <Button size="sm" variant="subtle" onClick={onEditVideo}>
              動画の URL を貼る
            </Button>
          ) : work.videoSource === 'manual' ? (
            <Button size="sm" variant="subtle" onClick={onEditVideo}>
              動画を変える
            </Button>
          ) : null}
        </Group>
      </Stack>
    </Card>
  )
}
```

Mantine の `size="sm"` のボタンは高さ 36px。既存の `styles.css` にタップ対象を 44px に広げる取り決め（粗いポインタ向けの `min-height`）があればそれに乗る。無ければ 3 つのボタンに `mih={44}` を付ける（SHIG 78）。`grep -n "pointer: coarse" src/styles.css` で確かめる。

- [ ] **Step 7: 動画 URL のフォーム**

`src/components/works/WorkVideoForm.tsx`:

```tsx
import { Button, Group, Stack, TextInput } from '@mantine/core'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { canonicalYouTubeUrl, parseYouTubeId } from '../../lib/youtube'
import type { WorkRow } from '../../server/repository/works'
import { saveWorkVideo } from '../../server/works'

/**
 * Paste a tour video for a work whose site does not link one. The URL is checked here with the
 * same parser the server uses, so the reason shows up at once (SHIG 50, 46: any YouTube URL
 * shape is accepted and normalised to the id on the server).
 */
export function WorkVideoForm({
  work,
  onSaved,
  onCancel,
}: {
  work: WorkRow
  onSaved: () => void
  onCancel: () => void
}) {
  const save = useServerFn(saveWorkVideo)
  const [url, setUrl] = useState(work.youtubeVideoId ? canonicalYouTubeUrl(work.youtubeVideoId) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(next: string | null) {
    if (next !== null && !parseYouTubeId(next)) {
      setError('YouTube の URL を入れてください')
      return
    }
    setBusy(true)
    try {
      await save({ data: { id: work.id, url: next } })
      onSaved()
    } catch {
      setError('保存できませんでした')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit(url.trim())
      }}
    >
      <Stack gap="md">
        <TextInput
          label="YouTube の URL"
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          onChange={(e) => {
            setUrl(e.currentTarget.value)
            setError(null)
          }}
          error={error}
          inputMode="url"
          autoComplete="off"
          data-autofocus
        />
        <Group justify="space-between">
          {/* Kept apart from 保存 (Save): removing is the destructive one (SHIG 16) */}
          {work.videoSource === 'manual' ? (
            <Button variant="subtle" color="red" disabled={busy} onClick={() => void submit(null)}>
              動画を外す
            </Button>
          ) : (
            <span />
          )}
          <Group gap="xs">
            <Button variant="default" disabled={busy} onClick={onCancel}>
              やめる
            </Button>
            <Button type="submit" loading={busy}>
              保存
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  )
}
```

- [ ] **Step 8: ルート**

`src/routes/works.tsx`:

```tsx
import { Chip, Group, Modal, SegmentedControl, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { EmptyState } from '../components/EmptyState'
import { PageShell } from '../components/PageShell'
import { WorkCard } from '../components/works/WorkCard'
import { WorkVideoForm } from '../components/works/WorkVideoForm'
import { worksSearchSchema, type WorksSearch } from '../components/works/worksSearch'
import { filterWorks, vendorOptions, watchedSummary } from '../lib/works/filter'
import type { WorkRow } from '../server/repository/works'
import { listWorks, markWorkWatched } from '../server/works'

/** Chip value for "no vendor filter" (not a vendor id) */
const ALL = 'all'

export const Route = createFileRoute('/works')({
  component: Page,
  validateSearch: (s) => worksSearchSchema.parse(s),
  loader: async () => ({ works: await listWorks() }),
})

function Page() {
  const { works } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/works' })
  const router = useRouter()
  const mark = useServerFn(markWorkWatched)
  const [editingVideo, setEditingVideo] = useState<WorkRow | null>(null)

  const vendors = vendorOptions(works)
  const visible = filterWorks(works, {
    vendorId: search.v,
    hasVideo: search.video,
    unwatched: search.unwatched,
  })
  const summary = watchedSummary(works)

  function setSearch(patch: Partial<WorksSearch>) {
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true })
  }

  async function setWatched(work: WorkRow, watched: boolean) {
    try {
      await mark({ data: { id: work.id, watched } })
      await router.invalidate()
    } catch {
      notifications.show({ message: '保存できませんでした', color: 'red' })
    }
  }

  return (
    <PageShell title="施工例" description="候補の会社の施工例をまとめて見る">
      {works.length === 0 ? (
        <EmptyState
          emoji="🏡"
          title="施工例がまだありません"
          description="取り込みが済むとここに並びます。"
        />
      ) : (
        <Stack gap="lg">
          <Stack gap="xs">
            <Chip.Group
              value={search.v ?? ALL}
              onChange={(v) => setSearch({ v: v === ALL ? undefined : (v as string) })}
            >
              <Group gap={6}>
                <Chip value={ALL} size="xs">
                  すべて
                </Chip>
                {vendors.map((vendor) => (
                  <Chip key={vendor.id} value={vendor.id} size="xs">
                    {vendor.name}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
            <Group gap={6}>
              <Chip
                size="xs"
                checked={search.video === true}
                onChange={(on) => setSearch({ video: on ? true : undefined })}
              >
                動画あり
              </Chip>
              <Chip
                size="xs"
                checked={search.unwatched === true}
                onChange={(on) => setSearch({ unwatched: on ? true : undefined })}
              >
                まだ見ていない
              </Chip>
            </Group>
            <Group justify="space-between" align="center">
              <Text size="sm">
                {summary.total} 件中 {summary.watched} 件を視聴済み
              </Text>
              <SegmentedControl
                size="xs"
                aria-label="表示"
                value={search.view ?? 'list'}
                onChange={(v) => setSearch({ view: v === 'spec' ? 'spec' : undefined })}
                data={[
                  { value: 'list', label: '一覧' },
                  { value: 'spec', label: '揃えて見る' },
                ]}
              />
            </Group>
          </Stack>

          {visible.length === 0 ? (
            <EmptyState emoji="🔍" title="条件に合う施工例がありません" />
          ) : (
            <Stack gap="md">
              {visible.map((work) => (
                <WorkCard
                  key={work.id}
                  work={work}
                  showSpecs={search.view === 'spec'}
                  onPlay={() => {}}
                  onToggleWatched={() => void setWatched(work, work.watchedAt === null)}
                  onEditVideo={() => setEditingVideo(work)}
                />
              ))}
            </Stack>
          )}
        </Stack>
      )}

      <Modal
        opened={editingVideo !== null}
        onClose={() => setEditingVideo(null)}
        title={editingVideo?.title}
        centered
      >
        {editingVideo ? (
          <WorkVideoForm
            work={editingVideo}
            onCancel={() => setEditingVideo(null)}
            onSaved={() => {
              setEditingVideo(null)
              void router.invalidate()
            }}
          />
        ) : null}
      </Modal>
    </PageShell>
  )
}
```

`onPlay={() => {}}` は Task 10 でプレーヤーを開く処理に差し替える（この時点では「動画を見る」は何もしない。Task 9 と 10 は同じ PR で出す）。

- [ ] **Step 9: ルートツリーを生成し、ナビに足す**

Run: `npm run generate-routes`
Expected: `src/routeTree.gen.ts` に `/works` が入る。

`src/components/AppLayout.tsx`: `lucide-react` の import に `Images` を足し、`HEADER_LINKS` の `{ to: '/sources', … }` の次の行に:

```ts
  { to: '/works', label: '施工例', Icon: Images },
```

`src/components/AppLayout.ui.test.tsx` の 83 行目付近の配列 `['用語集', '情報収集', '区画', '分析', '設定']` を `['用語集', '情報収集', '施工例', '区画', '分析', '設定']` にする（他にリンクの個数や並びを確かめている箇所があれば同じく直す）。

- [ ] **Step 10: 通ることを確かめる**

Run: `npx vitest run --config vitest.ui.config.ts src/routes/works.ui.test.tsx src/components/AppLayout.ui.test.tsx && npm run typecheck`
Expected: PASS。テストが役割の名前（`radio` / `checkbox` / `term`）で要素を見つけられないときは、テストではなく部品の側を直す（Mantine の `Chip` は単体で `checkbox`、`Chip.Group` 内で `radio`、`SegmentedControl` は `radio`。`<dt>` の役割は `term`）。

- [ ] **Step 11: コミット**

```bash
npm run format && npm run check:pii
git add src/routes/works.tsx src/routes/works.ui.test.tsx src/components/works src/components/AppLayout.tsx src/components/AppLayout.ui.test.tsx src/routeTree.gen.ts src/styles.css test/ui/fixtures.ts
git commit -m "feat(works): 施工例の一覧と揃えて見る表示（/works）"
```

---

### Task 10: アプリ内再生と自動の視聴チェック・CSP

**Files:**
- Create: `src/components/works/WorkPlayer.tsx`
- Modify: `src/routes/works.tsx`（プレーヤーの Modal・自動チェックと取り消しの通知）
- Modify: `src/lib/securityHeaders.ts`（`frame-src`）
- Modify: `src/lib/securityHeaders.test.ts`
- Test: `src/components/works/WorkPlayer.ui.test.tsx`、`src/routes/works.ui.test.tsx`（追記）

**Interfaces:**
- Consumes: `YOUTUBE_EMBED_ORIGIN` `LISTENING_MESSAGE` `EMPTY_PLAYER_INFO` `readPlayerMessage` `mergePlayerInfo` `shouldMarkWatched` `embedUrl`（Task 7）, `canonicalYouTubeUrl`
- Produces: `<WorkPlayer videoId={string} title={string} onWatched={() => void} />`

- [ ] **Step 1: CSP のテストを先に直す**

`src/lib/securityHeaders.test.ts` に足す:

```ts
  it('allows frames only from the no-cookie YouTube embed host', () => {
    const csp = SECURITY_HEADERS['content-security-policy']
    expect(csp).toContain("frame-src https://www.youtube-nocookie.com;")
    expect(csp).not.toContain('script-src')
  })
```

Run: `npx vitest run src/lib/securityHeaders.test.ts`
Expected: FAIL（`frame-src` が無い）

- [ ] **Step 2: CSP に `frame-src` を足す**

先に、アプリが他の iframe を使っていないことを確かめる:

Run: `grep -rn "<iframe\|createElement('iframe')" src --include='*.tsx' --include='*.ts' | grep -v "\.test\."`
Expected: 出力なし（出力があれば止めて、その埋め込み先も `frame-src` に要るかを報告する）

`src/lib/securityHeaders.ts` の `content-security-policy` の値を、`base-uri 'self';` の直後に `frame-src https://www.youtube-nocookie.com;` を入れた形にする:

```ts
  'content-security-policy':
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; frame-src https://www.youtube-nocookie.com; img-src 'self' data: blob: https://i.ytimg.com https://yt3.ggpht.com https://yt3.googleusercontent.com https://maps.googleapis.com https://maps.gstatic.com https://*.googleusercontent.com; connect-src 'self' https://maps.googleapis.com",
```

ファイル冒頭のコメントの括弧の中（`only \`frame-ancestors\`, …`）に 1 文を足す: `` `frame-src` allows only the no-cookie YouTube embed, for the tour videos on the works page. ``

Run: `npx vitest run src/lib/securityHeaders.test.ts`
Expected: PASS

- [ ] **Step 3: プレーヤーの失敗するテストを書く**

`src/components/works/WorkPlayer.ui.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderUi } from '../../../test/ui/render'
import { WorkPlayer } from './WorkPlayer'

const ORIGIN = 'https://www.youtube-nocookie.com'

function post(frame: HTMLIFrameElement, data: unknown, over: Partial<MessageEventInit> = {}) {
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: ORIGIN,
      source: frame.contentWindow,
      data: typeof data === 'string' ? data : JSON.stringify(data),
      ...over,
    }),
  )
}

function setup() {
  const onWatched = vi.fn()
  renderUi(<WorkPlayer videoId="abcdefghijk" title="テストの家" onWatched={onWatched} />)
  const frame = screen.getByTitle('テストの家 のルームツアー動画') as HTMLIFrameElement
  return { frame, onWatched }
}

describe('WorkPlayer', () => {
  it('embeds the no-cookie player and sends a referrer, which the app-wide no-referrer policy would drop', () => {
    const { frame } = setup()
    expect(frame.src).toContain('https://www.youtube-nocookie.com/embed/abcdefghijk?enablejsapi=1')
    expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
    expect(screen.getByRole('link', { name: 'YouTube で開く' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=abcdefghijk',
    )
  })

  it('reports watched once, when the position reaches 90% across partial messages', () => {
    const { frame, onWatched } = setup()
    post(frame, { event: 'initialDelivery', info: { duration: 600 } })
    post(frame, { event: 'infoDelivery', info: { currentTime: 100 } })
    expect(onWatched).not.toHaveBeenCalled()
    post(frame, { event: 'infoDelivery', info: { currentTime: 541 } })
    post(frame, { event: 'infoDelivery', info: { currentTime: 599 } })
    post(frame, { event: 'onStateChange', info: 0 })
    expect(onWatched).toHaveBeenCalledTimes(1)
  })

  it('reports watched when the player says it ended', () => {
    const { frame, onWatched } = setup()
    post(frame, { event: 'onStateChange', info: 0 })
    expect(onWatched).toHaveBeenCalledTimes(1)
  })

  it('ignores messages from another origin or another window', () => {
    const { frame, onWatched } = setup()
    post(frame, { event: 'onStateChange', info: 0 }, { origin: 'https://example.com' })
    post(frame, { event: 'onStateChange', info: 0 }, { source: window })
    post(frame, 'not json')
    expect(onWatched).not.toHaveBeenCalled()
  })

  it('stops listening after unmount', () => {
    const onWatched = vi.fn()
    const { unmount } = renderUi(
      <WorkPlayer videoId="abcdefghijk" title="テストの家" onWatched={onWatched} />,
    )
    const frame = screen.getByTitle('テストの家 のルームツアー動画') as HTMLIFrameElement
    const source = frame.contentWindow
    unmount()
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: ORIGIN,
        source,
        data: JSON.stringify({ event: 'onStateChange', info: 0 }),
      }),
    )
    expect(onWatched).not.toHaveBeenCalled()
  })
})
```

Run: `npx vitest run --config vitest.ui.config.ts src/components/works/WorkPlayer.ui.test.tsx`
Expected: FAIL（`./WorkPlayer` が無い）

- [ ] **Step 4: プレーヤーを実装する**

`src/components/works/WorkPlayer.tsx`:

```tsx
import { Anchor, AspectRatio, Stack } from '@mantine/core'
import { useEffect, useRef } from 'react'

import {
  EMPTY_PLAYER_INFO,
  LISTENING_MESSAGE,
  YOUTUBE_EMBED_ORIGIN,
  embedUrl,
  mergePlayerInfo,
  readPlayerMessage,
  shouldMarkWatched,
} from '../../lib/works/watch'
import { canonicalYouTubeUrl } from '../../lib/youtube'

/** The player may not be ready when the iframe loads: ask again until it answers, then stop */
const LISTEN_INTERVAL_MS = 500
const LISTEN_RETRIES = 20

/**
 * Tour video played inside the app. YouTube's script is not loaded (the CSP has no script-src
 * for it): the page asks the iframe to post its state, and reads the position from the
 * messages. onWatched fires once, at the end or at 90% (src/lib/works/watch.ts).
 */
export function WorkPlayer({
  videoId,
  title,
  onWatched,
}: {
  videoId: string
  title: string
  onWatched: () => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const onWatchedRef = useRef(onWatched)
  useEffect(() => {
    onWatchedRef.current = onWatched
  }, [onWatched])

  useEffect(() => {
    let info = EMPTY_PLAYER_INFO
    let heard = false
    let fired = false
    let tries = 0

    function onMessage(event: MessageEvent) {
      // Only the embedded player itself: any page can post a message to this window
      if (event.origin !== YOUTUBE_EMBED_ORIGIN) return
      if (event.source !== frame.current?.contentWindow) return
      const patch = readPlayerMessage(event.data)
      if (!patch) return
      heard = true
      info = mergePlayerInfo(info, patch)
      if (!fired && shouldMarkWatched(info)) {
        fired = true
        onWatchedRef.current()
      }
    }

    window.addEventListener('message', onMessage)
    const timer = window.setInterval(() => {
      tries += 1
      if (heard || tries > LISTEN_RETRIES) {
        window.clearInterval(timer)
        return
      }
      frame.current?.contentWindow?.postMessage(LISTENING_MESSAGE, YOUTUBE_EMBED_ORIGIN)
    }, LISTEN_INTERVAL_MS)

    return () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(timer)
    }
  }, [videoId])

  return (
    <Stack gap="xs">
      <AspectRatio ratio={16 / 9}>
        <iframe
          ref={frame}
          src={embedUrl(videoId, window.location.origin)}
          title={`${title} のルームツアー動画`}
          // The app sends `referrer-policy: no-referrer` on every response, and YouTube refuses
          // to play an embed that arrives without a referrer (player error 153)
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ border: 0 }}
        />
      </AspectRatio>
      {/* The way out when the embed cannot play (removed, embedding disabled) */}
      <Anchor href={canonicalYouTubeUrl(videoId)} target="_blank" rel="noreferrer" size="sm">
        YouTube で開く
      </Anchor>
    </Stack>
  )
}
```

`WorkPlayer` は Modal の中（クライアントで開いてから描画）にしか置かないので、`window.location.origin` は SSR で評価されない。

Run: `npx vitest run --config vitest.ui.config.ts src/components/works/WorkPlayer.ui.test.tsx`
Expected: PASS（5 件）

- [ ] **Step 5: ルートのテストを足す（自動チェックと取り消し）**

`src/routes/works.ui.test.tsx` の `describe` の中に:

```tsx
  it('plays the video in the app, marks it watched automatically and offers to take it back', async () => {
    const { user } = await renderRoute('/works')
    const full = within(await screen.findByRole('article', { name: '全部そろった家' }))
    await user.click(full.getByRole('button', { name: '動画を見る' }))

    const frame = (await screen.findByTitle('全部そろった家 のルームツアー動画')) as HTMLIFrameElement
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://www.youtube-nocookie.com',
        source: frame.contentWindow,
        data: JSON.stringify({ event: 'onStateChange', info: 0 }),
      }),
    )
    await waitFor(() =>
      expect(mockOf(markWorkWatched)).toHaveBeenCalledWith({ data: { id: uid(1), watched: true } }),
    )
    expect(await screen.findByText('視聴済みにしました')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '取り消す' }))
    await waitFor(() =>
      expect(mockOf(markWorkWatched)).toHaveBeenCalledWith({ data: { id: uid(1), watched: false } }),
    )
  })

  it('does not write again when an already watched video is played to the end', async () => {
    const { user } = await renderRoute('/works')
    const watched = within(await screen.findByRole('article', { name: '見終わった家' }))
    await user.click(watched.getByRole('button', { name: '動画を見る' }))
    const frame = (await screen.findByTitle('見終わった家 のルームツアー動画')) as HTMLIFrameElement
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://www.youtube-nocookie.com',
        source: frame.contentWindow,
        data: JSON.stringify({ event: 'onStateChange', info: 0 }),
      }),
    )
    await new Promise((done) => setTimeout(done, 50))
    expect(mockOf(markWorkWatched)).not.toHaveBeenCalled()
  })
```

Run: `npx vitest run --config vitest.ui.config.ts src/routes/works.ui.test.tsx`
Expected: FAIL（「動画を見る」を押してもプレーヤーが出ない）

- [ ] **Step 6: ルートにプレーヤーと通知をつなぐ**

`src/routes/works.tsx` を次のとおり変える。

import に足す:

```tsx
import { Button } from '@mantine/core' // 既存の @mantine/core の import に Button を足す
import { WorkPlayer } from '../components/works/WorkPlayer'
```

`Page` の状態に足す:

```tsx
  const [playing, setPlaying] = useState<WorkRow | null>(null)
```

`setWatched` を、成功を返す形に変え、その下に自動チェックの処理を足す:

```tsx
  async function setWatched(work: WorkRow, watched: boolean): Promise<boolean> {
    try {
      await mark({ data: { id: work.id, watched } })
      await router.invalidate()
      return true
    } catch {
      notifications.show({ message: '保存できませんでした', color: 'red' })
      return false
    }
  }

  /** Reached the end (or 90%) in the embedded player. No confirm dialog: say it, and offer the undo (SHIG 57, 54) */
  async function watchedByPlaying(work: WorkRow) {
    if (work.watchedAt !== null) return
    if (!(await setWatched(work, true))) return
    const notificationId = `watched-${work.id}`
    notifications.show({
      id: notificationId,
      message: (
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="sm">視聴済みにしました</Text>
          <Button
            variant="subtle"
            size="sm"
            onClick={() => {
              notifications.hide(notificationId)
              void setWatched(work, false)
            }}
          >
            取り消す
          </Button>
        </Group>
      ),
    })
  }
```

`WorkCard` の `onPlay={() => {}}` を `onPlay={() => setPlaying(work)}` に変える。

動画 URL の Modal の前に、プレーヤーの Modal を足す:

```tsx
      <Modal
        opened={playing !== null}
        onClose={() => setPlaying(null)}
        title={playing?.title}
        size="xl"
        centered
      >
        {playing?.youtubeVideoId ? (
          <WorkPlayer
            videoId={playing.youtubeVideoId}
            title={playing.title}
            onWatched={() => void watchedByPlaying(playing)}
          />
        ) : null}
      </Modal>
```

`playing` は開いた時点の行なので、`watchedByPlaying` の `work.watchedAt !== null` は「開いた時点ですでに視聴済みなら書かない」を意味する（開いている間に自動で付いた後は `WorkPlayer` 側が 1 回しか呼ばない）。

- [ ] **Step 7: 通ることを確かめる**

Run: `npx vitest run --config vitest.ui.config.ts src/routes/works.ui.test.tsx src/components/works && npm run typecheck`
Expected: PASS

- [ ] **Step 8: コミット**

```bash
npm run format && npm run check:pii
git add src/components/works/WorkPlayer.tsx src/components/works/WorkPlayer.ui.test.tsx src/routes/works.tsx src/routes/works.ui.test.tsx src/lib/securityHeaders.ts src/lib/securityHeaders.test.ts
git commit -m "feat(works): 動画をアプリ内で見たら自動で視聴済みにする"
```

---

### Task 11: 取り決めの追記・全体の確認・実データでの確認・PR

**Files:**
- Modify: `AGENTS.md`（「Design agreements」の末尾に 1 項目）

- [ ] **Step 1: AGENTS.md に取り決めを足す**

「Design agreements」の箇条書きの最後に:

```markdown
- Built examples (`/works`, the `works` table) come only from the SQL that
  `npm run import:works` (`scripts/import-works.ts`) writes to `seed.local/out/`; the owner runs
  it. Which sites are read is in `seed.local/works-sites.json` (gitignored), and the parsers are
  named `siteA`/`siteB`/`siteC` (`src/lib/works/`), never after a vendor: vendor names, site
  URLs and example names are real data and are not written in code, tests or commit messages.
  The upsert is keyed by `source_url` and never touches `watched_at`/`watched_by`, nor a video
  pasted by hand (`video_source = 'manual'`); a work whose detail page failed is left out of
  the SQL instead of being written half-empty, and works removed from a site are not deleted.
  The watched flag is one per work for both users. The tour video plays in a
  `youtube-nocookie.com` iframe without YouTube's script: the page reads the position from
  `postMessage` (`src/lib/works/watch.ts`) and marks the work watched at the end or at 90%. The
  iframe needs `referrerPolicy="strict-origin-when-cross-origin"` because the app-wide
  `referrer-policy: no-referrer` makes YouTube refuse the embed (player error 153), and
  `frame-src` in the CSP allows only that host (spec: `docs/superpowers/specs/2026-10-01-works-list-design.md`)
```

- [ ] **Step 2: CI と同じゲートを全部通す**

Run:

```bash
npm run check:pii && npm run format:check && npm run typecheck && npm run test:coverage && npm run test:ui && npm run test:server && npm run test:scripts && npm run build
```

Expected: すべて成功。`test:coverage` は 100%、`test:ui` はしきい値（lines 93 / statements 90 / functions 88 / branches 82）以上。落ちたらその場で直す（しきい値を下げない）。

- [ ] **Step 3: 差分に実データが無いことを目で確かめる**

Run: `git diff main --stat && git diff main | grep -nE "https?://[a-z0-9.-]+" | grep -vE "example\.(com|test)|youtube|youtu\.be|ytimg|googleapis|gstatic|googleusercontent|ggpht"`
Expected: 2 つ目のコマンドの出力なし（出たら、その URL が実在のサイトでないかを確かめて直す）。業者名・施工例の名前が無いことも差分を読んで確かめる。

- [ ] **Step 4: 実サイトで取り込みを確かめる（本人の設定ファイルが要る）**

`seed.local/works-sites.json` が無ければ、本人に 3 サイトぶんの作成を頼む（`listUrl` は各社の施工例一覧、`vendorId` は本番 D1 の `vendors.id`。分からなければ null）。あれば:

Run: `npm run import:works`
Expected: サイトごとに 1 行、件数の JSON と `failed pages: 0`。目安は siteA が works 28・video 19〜20・points と floorArea がほぼ全件、siteB が works 36・completedOn が大半、siteC が works 29・ua と floorArea が大半。**どれかの数が 0 や極端に少なければ、そのサイトのパーサが実物の HTML と合っていない** → `seed.local/cache/works/` の HTML を見てパーサとその架空のテストを直す（実物の HTML や値をテストに写さない）。

出力の SQL をローカルの D1 に流して画面で見る:

```bash
npx wrangler d1 execute sumai-log --local --file seed.local/out/works-$(date +%Y%m%d).sql
npm run dev
```

`vendorId` を入れた設定でローカルの D1 にその業者が無いと外部キーで失敗する。その場合は確認の間だけ `vendorId` を null にして生成し直す。

- [ ] **Step 5: 実ブラウザで確かめる（Review Focus 1）**

`http://localhost:3000/works` を開いて確かめる:

1. 「動画を見る」→ プレーヤーが**再生できる**（「エラー 153／動画プレーヤーの設定エラー」が出ない）。開発者ツールのコンソールに CSP の違反が出ない。
2. シークバーで 9 割より後ろへ進めて再生 →「視聴済みにしました」の通知が出て、閉じるとカードに「視聴済み」が付く。「取り消す」で外れる。
3. 幅 375px で横スクロールが出ない。「揃えて見る」で見出し（ポイント／家族構成／面積／間取り）が同じ順に並び、値の無い件に空の見出しや「—」が出ない。
4. ダーク表示で「視聴済み」のバッジと本文が読める。
5. その他メニュー（スマホ）とヘッダ（PC）に「施工例」があり、現在地として強調される。

自動のチェックが付かない（メッセージが来ない）ときは、コンソールで `window.addEventListener('message', e => console.log(e.origin, e.data))` を実行して、プレーヤーが何を送っているかを見てから `src/lib/works/watch.ts` とそのテストを直す。

- [ ] **Step 6: コミットして PR を作る**

```bash
git add AGENTS.md
git commit -m "docs(works): 施工例の取り込みと視聴チェックの取り決めを AGENTS.md に足す"
git push -u origin claude/works-list
```

PR の説明に書くこと:

- 何が増えたか（`/works`・取り込みスクリプト・`works` テーブル・CSP の `frame-src`）
- SHIG: 20（既定は全件・主要な作業を先に）, 33（空の状態で次を案内）, 46/50（YouTube の URL はどの形でも受けて正規化）, 47（無い値は行ごと消す）, 54/57（確認ダイアログなし・取り消せる通知）, 59/60/82（絞り込みを URL に持つ・ナビから戻れる）, 16（「動画を外す」を「保存」から離す）, 78（タップ対象 44px）, 96/70（視聴済みは色＋アイコン＋文字）
- 設計仕様との差: 「揃えて見る」は PC でも表ではなく、見出し列を固定幅にした定義リスト（本文幅 720px に 7 列が収まらないため）
- 本人の作業: ①本番 D1 にマイグレーション（`npm run db:migrate:remote`）②`seed.local/works-sites.json` を用意して `npm run import:works` ③`npx wrangler d1 execute sumai-log --remote --file seed.local/out/works-YYYYMMDD.sql`
- 末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
