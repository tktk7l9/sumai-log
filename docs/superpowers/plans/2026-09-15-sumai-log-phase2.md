# sumai-log Phase 2（予定・見学記録・写真・コメント）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 予定カレンダー、見学記録（写真つき）、二人のコメント、ホームの「次の予定」と「記録を書きませんか」を本番に出し、Phase 1 で投入済みの予定・見学記録・写真が画面で見えるようにする。

**Architecture:** Phase 1 の構成をそのまま伸ばす。純粋関数は `src/lib/`（100% ゲート）、DB 操作は `src/server/repository.ts`（db 引数・実 D1 でテスト）、server function は `src/server/*.ts`、写真の受け取りと配信だけは multipart / ストリームのためサーバールート（`src/routes/api.photos.tsx`, `api.photos.$.tsx`）。写真は端末側 Canvas で 1600px と 400px の JPEG に縮小してから送り、R2 には `photos/{visitId}/{photoId}-display.jpg` / `-thumb.jpg` で置く（Phase 1 の seed 取込と同じキー）。UI は既存の `Fab` / `FormDrawer` / `PageShell` / `Row` / `MemberChip` / `EmptyState` を使い回す。

**Tech Stack:** TanStack Start + React 19 + Mantine v9（`@mantine/dates` の `Calendar` `DateInput` `TimeInput`）+ Drizzle (D1) + R2 + vitest 4（node / workers pool）+ dayjs

**Spec:** `docs/superpowers/specs/2026-09-15-sumai-log-design.md`（§3 画面 予定/記録、§4 events/visits/photos/comments、§6 写真、§8 Phase 2）

## Global Constraints

- **PII をコード・テスト・seed・コメント・ドキュメントに書かない**（メール・氏名・住所・座標・地番・実在の業者名・地名）。テストは `owner@example.com` `partner@example.com` `甲` `乙` `テスト市` など架空値。`npm run check:pii` をコミット前に通す。レポートにも実データの値を書かない（件数のみ）
- リポジトリは **public**。二人のメールと `MEMBERS` は Worker の secret と `.dev.vars` にしか置かない
- `src/lib/` は純粋関数のみ（`cloudflare:workers`・fetch・`Date.now()`・DOM を持ち込まない）。`test:coverage` の 100% ゲート対象。「今」は引数で受け取る
- 日付は ISO-8601 の TEXT。**予定の `startsAt` は終日なら `YYYY-MM-DD`、時刻ありなら `YYYY-MM-DDTHH:MM:00+09:00`**（日本時間のオフセットを明示。日付キーは先頭 10 文字）。金額は円の整数、id は `text`（`crypto.randomUUID()`；seed 由来の id は UUID 形の sha256 なので検証は `UUID_SHAPE`）
- 写真: `<input type="file" accept="image/*" multiple>`（**`image/heic` を書かない**）。端末側で 表示用 1600px JPEG q0.8 と サムネ 400px を生成。1 回 20 枚まで・縮小後 2 MB 上限・サーバはマジックバイトで JPEG/PNG/WebP 以外を拒否。R2 バケットは非公開、配信は認証後に Worker 経由でストリーム、`Cache-Control: private, max-age=31536000, immutable` + ETag
- 認証は `src/start.ts` のグローバルミドルウェアのみ（ルート個別に書かない）。変更系は POST（server function は `{ method: 'POST' }`）
- Prettier: `semi: false` `singleQuote: true` `printWidth: 100` `trailingComma: 'all'`。UI の文言は日本語
- 完了基準: `npm run format:check` `typecheck` `test:coverage`（lib 100%）`test:server` `test:scripts` `build` `check:pii` がすべて green。ルートを足したら `npm run generate-routes`
- ローカル npm 10.9.2 は落ちるので `npx npm@11 install`。`wrangler.jsonc` の `compatibility_date` は変えない
- コミットメッセージ末尾に `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- Phase 1 の既存 API（この計画で使う）: `createServerFn().validator(zod).handler`、`getDb()`/`Db`、`currentActorEmail()`（失敗時は 403 Response を throw）、`allMembers()`、`findMember`、`UUID_SHAPE`、`emptyToNull`、`numberOrEmpty`/`optionalText`（`src/server/candidates.ts` にローカル定義。Phase 2 では `src/server/zod.ts` に移して共有する）、`listLinkTargets()` → `{ vendors: {id,name}[]; properties: {id,name}[] }`、`listPlaces()` → `PlaceWithLinks[]`、`holidayName(iso)`（`src/lib/holidays.ts`）、`Row`（`src/components/candidates/DetailRow.tsx`）、`FormDrawer({ opened, onClose, title, children, zIndex? })`、`Fab({ label, onClick })`、`MemberChip({ email, members })`、`EmptyState({ title, description?, action? })`

---

### Task 1: lib — カレンダーと「記録を書きませんか」の純粋関数

**Files:**
- Create: `src/lib/calendar.ts` `src/lib/calendar.test.ts` `src/lib/pending.ts` `src/lib/pending.test.ts`

**Interfaces:**
- Produces（`src/lib/calendar.ts`）: `dateKey(startsAt: string): string`（先頭 10 文字）／`composeStartsAt(date: string, time: string | null): string`（`time` が null なら `date`、あれば `${date}T${time}:00+09:00`）／`splitStartsAt(startsAt: string): { date: string; time: string | null }`／`monthKeys(year: number, month1to12: number): string[]`（その月の `YYYY-MM-DD` を全部）／`groupByDay<T extends { startsAt: string }>(items: T[]): Map<string, T[]>`（日付キー → 開始順）／`formatEventTime(e: { startsAt: string; endsAt: string | null; allDay: boolean }): string`（終日→「終日」、`13:00–15:30`、終了なしなら `13:00`）／`compareStartsAt(a, b): number`
- Produces（`src/lib/pending.ts`）: `type PendingEvent = { id: string; title: string; startsAt: string; endsAt: string | null; allDay: boolean; kind: string }`／`pendingVisitEvents<T extends PendingEvent>(events: readonly T[], recordedEventIds: ReadonlySet<string>, nowIso: string): T[]`（`kind` が `visit` か `viewing`、終わっている（終日なら日付 < 今日、時刻ありなら `endsAt ?? startsAt` < now）、`recordedEventIds` に無いもの。新しい順）／`upcomingEvents<T extends { startsAt: string }>(events: T[], nowIso: string, limit: number): T[]`（日付キー ≥ 今日、開始順、`limit` 件）

- [ ] **Step 1: `src/lib/calendar.test.ts`**

```ts
import { describe, expect, it } from 'vitest'

import {
  compareStartsAt,
  composeStartsAt,
  dateKey,
  formatEventTime,
  groupByDay,
  monthKeys,
  splitStartsAt,
} from './calendar'

describe('dateKey / composeStartsAt / splitStartsAt', () => {
  it('終日は日付だけ、時刻ありは +09:00 付きで往復する', () => {
    expect(composeStartsAt('2030-01-05', null)).toBe('2030-01-05')
    expect(composeStartsAt('2030-01-05', '13:00')).toBe('2030-01-05T13:00:00+09:00')
    expect(dateKey('2030-01-05T13:00:00+09:00')).toBe('2030-01-05')
    expect(dateKey('2030-01-05')).toBe('2030-01-05')
    expect(splitStartsAt('2030-01-05T13:00:00+09:00')).toEqual({ date: '2030-01-05', time: '13:00' })
    expect(splitStartsAt('2030-01-05')).toEqual({ date: '2030-01-05', time: null })
  })
})

describe('monthKeys', () => {
  it('うるう年の 2 月は 29 日', () => {
    const keys = monthKeys(2028, 2)
    expect(keys).toHaveLength(29)
    expect(keys[0]).toBe('2028-02-01')
    expect(keys[28]).toBe('2028-02-29')
    expect(monthKeys(2030, 12)).toHaveLength(31)
  })
})

describe('groupByDay', () => {
  it('日付キーでまとめ、日内は開始順', () => {
    const g = groupByDay([
      { id: 'b', startsAt: '2030-01-05T15:00:00+09:00' },
      { id: 'a', startsAt: '2030-01-05T09:30:00+09:00' },
      { id: 'c', startsAt: '2030-01-06' },
      { id: 'd', startsAt: '2030-01-05' },
    ])
    expect([...g.keys()]).toEqual(['2030-01-05', '2030-01-06'])
    expect(g.get('2030-01-05')?.map((e) => e.id)).toEqual(['d', 'a', 'b'])
  })
})

describe('formatEventTime', () => {
  it('終日／開始–終了／開始のみ', () => {
    expect(formatEventTime({ startsAt: '2030-01-05', endsAt: null, allDay: true })).toBe('終日')
    expect(
      formatEventTime({
        startsAt: '2030-01-05T13:00:00+09:00',
        endsAt: '2030-01-05T15:30:00+09:00',
        allDay: false,
      }),
    ).toBe('13:00–15:30')
    expect(
      formatEventTime({ startsAt: '2030-01-05T13:00:00+09:00', endsAt: null, allDay: false }),
    ).toBe('13:00')
  })
})

describe('compareStartsAt', () => {
  it('終日は同じ日の時刻ありより前', () => {
    expect(compareStartsAt('2030-01-05', '2030-01-05T09:00:00+09:00')).toBeLessThan(0)
    expect(compareStartsAt('2030-01-06', '2030-01-05T23:00:00+09:00')).toBeGreaterThan(0)
    expect(compareStartsAt('2030-01-05', '2030-01-05')).toBe(0)
  })
})
```

- [ ] **Step 2: 失敗確認** — `npx vitest run src/lib/calendar.test.ts` → FAIL（module not found）

- [ ] **Step 3: `src/lib/calendar.ts`**

```ts
/**
 * 予定の日時表現。DB には TEXT で、終日は 'YYYY-MM-DD'、時刻ありは
 * 'YYYY-MM-DDTHH:MM:00+09:00'（日本時間のオフセットを明示）で入る。
 * 日付キーは先頭 10 文字。Date オブジェクトに変換しない（タイムゾーンで壊れる）。
 */

export function dateKey(startsAt: string): string {
  return startsAt.slice(0, 10)
}

export function composeStartsAt(date: string, time: string | null): string {
  return time ? `${date}T${time}:00+09:00` : date
}

export function splitStartsAt(startsAt: string): { date: string; time: string | null } {
  const date = dateKey(startsAt)
  const time = startsAt.length > 10 ? startsAt.slice(11, 16) : null
  return { date, time }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
}

export function monthKeys(year: number, month1to12: number): string[] {
  const n = daysInMonth(year, month1to12)
  const keys: string[] = []
  for (let d = 1; d <= n; d += 1) keys.push(`${year}-${pad(month1to12)}-${pad(d)}`)
  return keys
}

/** 終日('YYYY-MM-DD')は同じ日の時刻ありより前に並ぶ（文字列比較でそうなる） */
export function compareStartsAt(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function groupByDay<T extends { startsAt: string }>(items: readonly T[]): Map<string, T[]> {
  const sorted = [...items].sort((a, b) => compareStartsAt(a.startsAt, b.startsAt))
  const map = new Map<string, T[]>()
  for (const item of sorted) {
    const key = dateKey(item.startsAt)
    const list = map.get(key)
    if (list) list.push(item)
    else map.set(key, [item])
  }
  return map
}

export function formatEventTime(e: {
  startsAt: string
  endsAt: string | null
  allDay: boolean
}): string {
  if (e.allDay) return '終日'
  const start = splitStartsAt(e.startsAt).time ?? ''
  const end = e.endsAt ? splitStartsAt(e.endsAt).time : null
  return end ? `${start}–${end}` : start
}
```

- [ ] **Step 4: 通過確認** — PASS

- [ ] **Step 5: `src/lib/pending.test.ts`**

```ts
import { describe, expect, it } from 'vitest'

import { pendingVisitEvents, upcomingEvents, type PendingEvent } from './pending'

const ev = (id: string, startsAt: string, kind = 'visit', endsAt: string | null = null): PendingEvent => ({
  id,
  title: id,
  startsAt,
  endsAt,
  allDay: startsAt.length === 10,
  kind,
})

describe('pendingVisitEvents', () => {
  const now = '2030-01-10T12:00:00+09:00'
  it('終わった見学/内覧で記録が無いものを新しい順に返す', () => {
    const events = [
      ev('old', '2030-01-05'),
      ev('done', '2030-01-06'),
      ev('timed', '2030-01-10T09:00:00+09:00', 'viewing', '2030-01-10T10:00:00+09:00'),
      ev('later-today', '2030-01-10T13:00:00+09:00'),
      ev('future', '2030-01-12'),
      ev('meeting', '2030-01-04', 'meeting'),
      ev('today-allday', '2030-01-10'),
    ]
    expect(pendingVisitEvents(events, new Set(['done']), now).map((e) => e.id)).toEqual([
      'timed',
      'old',
    ])
  })
  it('空なら空', () => {
    expect(pendingVisitEvents([], new Set(), now)).toEqual([])
  })
})

describe('upcomingEvents', () => {
  it('今日以降を開始順に limit 件', () => {
    const events = [ev('c', '2030-01-12'), ev('a', '2030-01-10'), ev('b', '2030-01-11'), ev('past', '2030-01-09')]
    expect(upcomingEvents(events, '2030-01-10T08:00:00+09:00', 2).map((e) => e.id)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 6: 失敗確認** — FAIL

- [ ] **Step 7: `src/lib/pending.ts`**

```ts
import { compareStartsAt, dateKey } from './calendar'

export type PendingEvent = {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
  allDay: boolean
  kind: string
}

const RECORDABLE = new Set(['visit', 'viewing'])

/** 終わった見学/内覧で、まだ見学記録が無いもの。新しい順 */
export function pendingVisitEvents<T extends PendingEvent>(
  events: readonly T[],
  recordedEventIds: ReadonlySet<string>,
  nowIso: string,
): T[] {
  const today = dateKey(nowIso)
  return events
    .filter((e) => RECORDABLE.has(e.kind) && !recordedEventIds.has(e.id))
    .filter((e) => (e.allDay ? dateKey(e.startsAt) < today : (e.endsAt ?? e.startsAt) < nowIso))
    .sort((a, b) => compareStartsAt(b.startsAt, a.startsAt))
}

/** 今日以降の予定を開始順に limit 件 */
export function upcomingEvents<T extends { startsAt: string }>(
  events: readonly T[],
  nowIso: string,
  limit: number,
): T[] {
  const today = dateKey(nowIso)
  return [...events]
    .filter((e) => dateKey(e.startsAt) >= today)
    .sort((a, b) => compareStartsAt(a.startsAt, b.startsAt))
    .slice(0, limit)
}
```

- [ ] **Step 8: 通過とカバレッジ** — `npm run test:coverage` → lib 100%（足りない分岐はテストを足す）

- [ ] **Step 9: コミット**

```bash
git add src/lib/calendar.ts src/lib/calendar.test.ts src/lib/pending.ts src/lib/pending.test.ts
git commit -m "feat(lib): 予定の日時表現と「記録を書きませんか」の判定

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: server — 予定（events）の repository と server function、共有 zod ヘルパ

**Files:**
- Create: `src/server/zod.ts` `src/server/events.ts`
- Modify: `src/server/repository.ts`（events 関数を追記）`src/server/repository.worker-test.ts`（events の describe を追記）`src/server/candidates.ts` `src/server/places.ts`（ローカル定義の `optionalText` `optionalUrl` `numberOrEmpty` `optionalInt` `idInput` を `./zod` から import する）

**Interfaces:**
- Produces（`src/server/zod.ts`）: `idInput`（`z.object({ id })`）／`idField`（`z.string().regex(UUID_SHAPE, 'id の形式が不正です')`）／`optionalText`／`optionalUrl`／`numberOrEmpty`／`optionalInt`／`dateField`（`z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD')`）／`timeField`（`z.string().regex(/^\d{2}:\d{2}$/, '時刻は HH:MM')`）
- Produces（repository）: `upsertEvent(db, input: EventInput, actorEmail): Promise<string>`／`deleteEvent(db, id): Promise<void>`／`listEventsBetween(db, fromKey: string, toKey: string): Promise<Event[]>`（`substr(starts_at,1,10)` が範囲内、開始順）／`listAllEvents(db): Promise<Event[]>`／`listRecordedEventIds(db): Promise<Set<string>>`（visits.eventId の非 null 集合）／`listEventsWithLinks(db, fromKey, toKey)` → `Event & { placeName: string | null; vendorName: string | null; propertyName: string | null }`；型 `EventWithLinks`
- Produces（server fns）: `listMonthEvents({ data: { year, month } })` → `{ events: EventWithLinks[]; recordedEventIds: string[]; todayKey: string }`／`getEvent({ data: { id } })` → `{ event: Event }`／`saveEvent({ data: EventInput })` → `{ id }`／`deleteEvent({ data: { id } })`／`listHomeEvents()` → `{ upcoming: EventWithLinks[]; pending: EventWithLinks[]; nowIso: string }`（今日以降 3 件と `pendingVisitEvents`）
- `eventInput`（zod）: `{ id?, title(1..200), kind(EVENT_KINDS), date: dateField, allDay: boolean, startTime: timeField | null, endTime: timeField | null, placeId: idField | null, vendorId: idField | null, propertyId: idField | null, note: optionalText }` → transform で `startsAt = composeStartsAt(date, allDay ? null : startTime)`, `endsAt = allDay || !endTime ? null : composeStartsAt(date, endTime)`；`allDay` でないのに `startTime` が無ければエラー「開始時刻を入れてください」

- [ ] **Step 1: `src/server/zod.ts` を作り、`candidates.ts` / `places.ts` の重複定義を置き換える**

```ts
import { z } from 'zod'

import { emptyToNull } from '../lib/emptyToNull'
import { UUID_SHAPE } from '../lib/ids'

export const idField = z.string().regex(UUID_SHAPE, 'id の形式が不正です')
export const idInput = z.object({ id: idField })

export const optionalText = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (v === '' ? null : v))
  .nullable()

export const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .refine((v) => v === null || /^https?:\/\//.test(v), 'URL は http(s):// で始めてください')

/** Mantine の NumberInput は空欄で '' を emit する。境界で null に直す */
export const numberOrEmpty = <T extends z.ZodNumber>(schema: T) =>
  z
    .union([schema, z.literal('')])
    .transform(emptyToNull)
    .nullable()
export const optionalInt = numberOrEmpty(z.number().int())

export const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD')
export const timeField = z.string().regex(/^\d{2}:\d{2}$/, '時刻は HH:MM')
```

`candidates.ts` と `places.ts` から同名のローカル定義を削除し `import { idField, idInput, numberOrEmpty, optionalInt, optionalText, optionalUrl } from './zod'` に置き換える（挙動は同一。`npm run test:server` と `typecheck` で確認）。

- [ ] **Step 2: `repository.worker-test.ts` に events の describe を追記（先に書いて FAIL を確認）**

```ts
import { events, visits } from '../db/schema'
import { listEventsBetween, listEventsWithLinks, listRecordedEventIds, upsertEvent, deleteEvent } from './repository'

describe('events', () => {
  it('範囲検索は日付キーで比較し、終日と時刻ありが混ざっても開始順', async () => {
    await upsertEvent(db, { title: '見学A', kind: 'visit', startsAt: '2030-01-05T13:00:00+09:00', endsAt: null, allDay: false }, actor)
    await upsertEvent(db, { title: '終日B', kind: 'other', startsAt: '2030-01-05', endsAt: null, allDay: true }, actor)
    await upsertEvent(db, { title: '来月', kind: 'visit', startsAt: '2030-02-01', endsAt: null, allDay: true }, actor)
    const rows = await listEventsBetween(db, '2030-01-01', '2030-01-31')
    expect(rows.map((r) => r.title)).toEqual(['終日B', '見学A'])
  })

  it('更新は createdBy を保ち、削除で見学記録の eventId が外れる', async () => {
    const id = await upsertEvent(db, { title: 'X', kind: 'visit', startsAt: '2030-01-05', endsAt: null, allDay: true }, actor)
    await upsertEvent(db, { id, title: 'Y', kind: 'meeting', startsAt: '2030-01-06', endsAt: null, allDay: true }, 'partner@example.com')
    const [row] = await db.select().from(events).where(eq(events.id, id))
    expect(row.title).toBe('Y')
    expect(row.createdBy).toBe(actor)
    await db.insert(visits).values({ id: crypto.randomUUID(), eventId: id, visitedOn: '2030-01-06', createdBy: actor })
    expect(await listRecordedEventIds(db)).toEqual(new Set([id]))
    await deleteEvent(db, id)
    const [visit] = await db.select().from(visits)
    expect(visit.eventId).toBeNull()
  })

  it('一覧に場所名・業者名が付く', async () => {
    const vendorId = await upsertVendor(db, { name: '甲工務店', kind: 'koumuten', serviceAreas: [] }, actor)
    const placeId = await upsertPlace(db, { name: 'テスト展示場', kind: 'showroom', vendorId }, actor)
    await upsertEvent(db, { title: 'E', kind: 'visit', startsAt: '2030-01-05', endsAt: null, allDay: true, placeId, vendorId }, actor)
    const [row] = await listEventsWithLinks(db, '2030-01-01', '2030-01-31')
    expect([row.placeName, row.vendorName, row.propertyName]).toEqual(['テスト展示場', '甲工務店', null])
  })
})
```

`reset()` の DELETE 対象に `events` と `visits` が既に含まれていることを確認する（Task 4 の Phase 1 実装で含めてある）。

- [ ] **Step 3: `repository.ts` に追記**

```ts
import { events, type NewEvent } from '../db/schema'

type EventInput = Omit<NewEvent, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & { id?: string }

export async function upsertEvent(db: Db, input: EventInput, actorEmail: string): Promise<string> {
  const { id, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(events).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  await db
    .update(events)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(events.id, id))
  return id
}

/** 予定を消す。見学記録の eventId は FK の SET NULL で外れる（記録は残る） */
export async function deleteEvent(db: Db, id: string): Promise<void> {
  await db.delete(events).where(eq(events.id, id))
}

export async function listEventsBetween(db: Db, fromKey: string, toKey: string) {
  return db
    .select()
    .from(events)
    .where(sql`substr(${events.startsAt}, 1, 10) between ${fromKey} and ${toKey}`)
    .orderBy(asc(events.startsAt))
}

export async function listAllEvents(db: Db) {
  return db.select().from(events).orderBy(asc(events.startsAt))
}

export async function listRecordedEventIds(db: Db): Promise<Set<string>> {
  const rows = await db
    .select({ eventId: visits.eventId })
    .from(visits)
    .where(sql`${visits.eventId} is not null`)
  return new Set(rows.map((r) => r.eventId as string))
}

export async function listEventsWithLinks(db: Db, fromKey: string, toKey: string) {
  const rows = await db
    .select({
      event: events,
      placeName: places.name,
      vendorName: vendors.name,
      propertyName: properties.name,
    })
    .from(events)
    .leftJoin(places, eq(events.placeId, places.id))
    .leftJoin(vendors, eq(events.vendorId, vendors.id))
    .leftJoin(properties, eq(events.propertyId, properties.id))
    .where(sql`substr(${events.startsAt}, 1, 10) between ${fromKey} and ${toKey}`)
    .orderBy(asc(events.startsAt))
  return rows.map((r) => ({
    ...r.event,
    placeName: r.placeName ?? null,
    vendorName: r.vendorName ?? null,
    propertyName: r.propertyName ?? null,
  }))
}
export type EventWithLinks = Awaited<ReturnType<typeof listEventsWithLinks>>[number]
```

（`asc` は `drizzle-orm` から import。既存 import に足す）

- [ ] **Step 4: `npm run test:server` → PASS**

- [ ] **Step 5: `src/server/events.ts`**

```ts
import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '../db/client'
import { EVENT_KINDS, events } from '../db/schema'
import { composeStartsAt, dateKey, monthKeys } from '../lib/calendar'
import { pendingVisitEvents, upcomingEvents } from '../lib/pending'
import { currentActorEmail } from './members'
import {
  deleteEvent as deleteEventRow,
  listEventsWithLinks,
  listRecordedEventIds,
  upsertEvent,
} from './repository'
import { dateField, idField, idInput, optionalText, timeField } from './zod'

export const eventInput = z
  .object({
    id: idField.optional(),
    title: z.string().trim().min(1, 'タイトルは必須です').max(200),
    kind: z.enum(EVENT_KINDS),
    date: dateField,
    allDay: z.boolean(),
    startTime: timeField.nullable(),
    endTime: timeField.nullable(),
    placeId: idField.nullable(),
    vendorId: idField.nullable(),
    propertyId: idField.nullable(),
    note: optionalText,
  })
  .refine((v) => v.allDay || v.startTime !== null, {
    message: '開始時刻を入れてください',
    path: ['startTime'],
  })
  .transform(({ date, startTime, endTime, ...rest }) => ({
    ...rest,
    startsAt: composeStartsAt(date, rest.allDay ? null : startTime),
    endsAt: rest.allDay || !endTime ? null : composeStartsAt(date, endTime),
  }))
export type EventInput = z.input<typeof eventInput>

/** 「今」。JST の ISO 文字列（Worker は UTC なので +9h して整形） */
export function nowJstIso(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return `${d.toISOString().slice(0, 19)}+09:00`
}

export const listMonthEvents = createServerFn()
  .validator(z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) }))
  .handler(async ({ data }) => {
    const db = getDb()
    const keys = monthKeys(data.year, data.month)
    const [rows, recorded] = await Promise.all([
      listEventsWithLinks(db, keys[0], keys[keys.length - 1]),
      listRecordedEventIds(db),
    ])
    return { events: rows, recordedEventIds: [...recorded], todayKey: dateKey(nowJstIso()) }
  })

export const getEvent = createServerFn()
  .validator(idInput)
  .handler(async ({ data }) => {
    const [event] = await getDb().select().from(events).where(eq(events.id, data.id)).limit(1)
    if (!event) throw new Response('Not Found', { status: 404 })
    return { event }
  })

export const saveEvent = createServerFn({ method: 'POST' })
  .validator(eventInput)
  .handler(async ({ data }) => ({ id: await upsertEvent(getDb(), data, await currentActorEmail()) }))

export const deleteEvent = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    await deleteEventRow(getDb(), data.id)
    return { ok: true as const }
  })

/** ホーム用: 次の予定 3 件と「記録を書きませんか」 */
export const listHomeEvents = createServerFn().handler(async () => {
  const db = getDb()
  const now = nowJstIso()
  const today = dateKey(now)
  // 過去 90 日〜未来 365 日を見れば十分
  const from = dateKey(new Date(Date.parse(today) - 90 * 86400000).toISOString())
  const to = dateKey(new Date(Date.parse(today) + 365 * 86400000).toISOString())
  const [rows, recorded] = await Promise.all([listEventsWithLinks(db, from, to), listRecordedEventIds(db)])
  return {
    upcoming: upcomingEvents(rows, now, 3),
    pending: pendingVisitEvents(rows, recorded, now).slice(0, 5),
    nowIso: now,
  }
})
```

`pendingVisitEvents` はジェネリックなので `rows` の型（`placeName` 等つき）がそのまま返る。

- [ ] **Step 6: 検証とコミット**

```bash
npm run typecheck && npm run test:coverage && npm run test:server && npm run format:check
git add -A
git commit -m "feat(server): 予定の repository / server function と zod ヘルパの共有化

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 予定タブ（月カレンダー・日別リスト・予定フォーム）

**Files:**
- Modify: `src/routes/calendar.tsx`（プレースホルダを置換）
- Create: `src/components/calendar/EventForm.tsx` `src/components/calendar/EventList.tsx` `src/components/calendar/EventItem.tsx`

**Interfaces:**
- Consumes: `listMonthEvents` `saveEvent` `deleteEvent` `eventInput` `EventInput`（Task 2）、`listLinkTargets` `listPlaces`（Phase 1）、`groupByDay` `formatEventTime` `splitStartsAt` `dateKey`（Task 1）、`holidayName`（`src/lib/holidays.ts`）、`Fab` `FormDrawer` `EmptyState` `PageShell`、`EVENT_KIND_LABEL`（schema）
- Produces: `EventForm({ event: EventWithLinks | null, defaults?: { date?: string; placeId?: string; vendorId?: string; propertyId?: string }, targets, places, onSaved })`、`EventList({ events, recordedEventIds, onEdit, onDelete, onRecord })`（`onRecord(eventId)` は Task 8 で「記録を書く」に繋ぐ。ここでは `undefined` 可）

- [ ] **Step 1: `src/routes/calendar.tsx`**

```tsx
import { Badge, Group, Indicator, SegmentedControl, Stack, Text } from '@mantine/core'
import { Calendar } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { z } from 'zod'

import { EventForm } from '../components/calendar/EventForm'
import { EventList } from '../components/calendar/EventList'
import { EmptyState } from '../components/EmptyState'
import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { dateKey, groupByDay } from '../lib/calendar'
import { holidayName } from '../lib/holidays'
import { deleteEvent, listMonthEvents } from '../server/events'
import { listLinkTargets, listPlaces } from '../server/places'
import type { EventWithLinks } from '../server/repository'

const search = z.object({
  // 表示中の月 'YYYY-MM'。無ければ今月
  m: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  // 選択日 'YYYY-MM-DD'
  d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const Route = createFileRoute('/calendar')({
  component: Page,
  validateSearch: (s) => search.parse(s),
  loaderDeps: ({ search }) => ({ m: search.m }),
  loader: async ({ deps }) => {
    // サーバー側で「今月」を決める（クライアントの時計に依らない）
    const base = deps.m ? { year: Number(deps.m.slice(0, 4)), month: Number(deps.m.slice(5, 7)) } : null
    const [month, targets, places] = await Promise.all([
      listMonthEvents({ data: base ?? currentYearMonth() }),
      listLinkTargets(),
      listPlaces(),
    ])
    return { ...month, targets, places, ym: base ?? currentYearMonth() }
  },
})

function currentYearMonth() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

function Page() {
  const { events, recordedEventIds, todayKey, targets, places, ym } = Route.useLoaderData()
  const { d } = Route.useSearch()
  const navigate = useNavigate({ from: '/calendar' })
  const router = useRouter()
  const remove = useServerFn(deleteEvent)
  const [editing, setEditing] = useState<EventWithLinks | null>(null)
  const [creating, setCreating] = useState(false)

  const byDay = useMemo(() => groupByDay(events), [events])
  const recorded = useMemo(() => new Set(recordedEventIds), [recordedEventIds])
  const selected = d ?? todayKey
  const dayEvents = byDay.get(selected) ?? []
  const monthDate = new Date(Date.UTC(ym.year, ym.month - 1, 1))

  async function handleDelete(e: EventWithLinks) {
    if (!window.confirm(`「${e.title}」を削除します。見学記録は残ります。`)) return
    try {
      await remove({ data: { id: e.id } })
      await router.invalidate()
      notifications.show({ message: '予定を削除しました' })
    } catch {
      notifications.show({ message: '削除できませんでした', color: 'red' })
    }
  }

  return (
    <PageShell title="予定">
      <Stack gap="md" align="center">
        <Calendar
          date={monthDate}
          onDateChange={(next) =>
            navigate({ search: (s) => ({ ...s, m: dayjs(next).format('YYYY-MM') }) })
          }
          size="md"
          getDayProps={(date) => {
            const key = dayjs(date).format('YYYY-MM-DD')
            return {
              selected: key === selected,
              onClick: () => navigate({ search: (s) => ({ ...s, d: key }) }),
            }
          }}
          renderDay={(date) => {
            const key = dayjs(date).format('YYYY-MM-DD')
            const n = byDay.get(key)?.length ?? 0
            const holiday = holidayName(key)
            return (
              <Indicator size={6} color="clay" offset={-2} disabled={n === 0}>
                <Text size="sm" c={holiday ? 'red' : undefined} fw={key === todayKey ? 700 : undefined}>
                  {date.getDate()}
                </Text>
              </Indicator>
            )
          }}
        />
        <Group justify="space-between" w="100%">
          <Text fw={700}>
            {selected}
            {holidayName(selected) ? (
              <Badge ml="xs" color="red" variant="light">
                {holidayName(selected)}
              </Badge>
            ) : null}
          </Text>
        </Group>
        {dayEvents.length === 0 ? (
          <EmptyState title="この日の予定はありません" description="右下の追加から登録できます。" />
        ) : (
          <EventList events={dayEvents} recordedEventIds={recorded} onEdit={setEditing} onDelete={handleDelete} onRecord={undefined} />
        )}
      </Stack>

      <Fab label="予定を追加" onClick={() => setCreating(true)} />
      <FormDrawer opened={creating} onClose={() => setCreating(false)} title="予定を追加">
        <EventForm event={null} defaults={{ date: selected }} targets={targets} places={places} onSaved={() => setCreating(false)} />
      </FormDrawer>
      <FormDrawer opened={editing !== null} onClose={() => setEditing(null)} title="予定を編集">
        {editing ? (
          <EventForm event={editing} targets={targets} places={places} onSaved={() => setEditing(null)} />
        ) : null}
      </FormDrawer>
    </PageShell>
  )
}
```

`Calendar` の `date`/`onDateChange` は表示月の制御、`getDayProps` で選択とクリック、`renderDay` でドットと祝日色（インストール済み Mantine v9 でプロパティ名が違えば `node_modules/@mantine/dates` の型を見て最小限合わせ、レポートに書く）。`SegmentedControl` は不要なら import から外す（未使用 import は typecheck が落とす）。

- [ ] **Step 2: `EventItem.tsx` と `EventList.tsx`**

```tsx
// src/components/calendar/EventItem.tsx
import { ActionIcon, Badge, Button, Card, Group, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { MapPin, Pencil, Trash2 } from 'lucide-react'

import { EVENT_KIND_LABEL } from '../../db/schema'
import { formatEventTime } from '../../lib/calendar'
import type { EventWithLinks } from '../../server/repository'

export function EventItem({
  event,
  recorded,
  onEdit,
  onDelete,
  onRecord,
}: {
  event: EventWithLinks
  recorded: boolean
  onEdit: (e: EventWithLinks) => void
  onDelete: (e: EventWithLinks) => void
  onRecord?: (e: EventWithLinks) => void
}) {
  const who = event.placeName ?? event.vendorName ?? event.propertyName
  return (
    <Card withBorder padding="sm">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
              {formatEventTime(event)}
            </Text>
            <Text fw={600} lineClamp={1}>
              {event.title}
            </Text>
          </Group>
          <Group gap={4} wrap="nowrap">
            <ActionIcon variant="subtle" aria-label="編集" onClick={() => onEdit(event)}>
              <Pencil size={16} />
            </ActionIcon>
            <ActionIcon variant="subtle" color="red" aria-label="削除" onClick={() => onDelete(event)}>
              <Trash2 size={16} />
            </ActionIcon>
          </Group>
        </Group>
        <Group gap="xs">
          <Badge variant="default" size="xs">
            {EVENT_KIND_LABEL[event.kind]}
          </Badge>
          {who ? (
            <Group gap={4}>
              <MapPin size={12} aria-hidden />
              {event.placeId ? (
                <Text size="xs" component={Link} to="/places/$id" params={{ id: event.placeId }}>
                  {who}
                </Text>
              ) : (
                <Text size="xs" c="dimmed">
                  {who}
                </Text>
              )}
            </Group>
          ) : null}
          {recorded ? (
            <Badge color="teal" variant="light" size="xs">
              記録あり
            </Badge>
          ) : onRecord ? (
            <Button size="compact-xs" variant="light" onClick={() => onRecord(event)}>
              記録を書く
            </Button>
          ) : null}
        </Group>
        {event.note ? (
          <Text size="sm" className="breakable" style={{ whiteSpace: 'pre-wrap' }}>
            {event.note}
          </Text>
        ) : null}
      </Stack>
    </Card>
  )
}
```

```tsx
// src/components/calendar/EventList.tsx
import { Stack } from '@mantine/core'

import type { EventWithLinks } from '../../server/repository'
import { EventItem } from './EventItem'

export function EventList({
  events,
  recordedEventIds,
  onEdit,
  onDelete,
  onRecord,
}: {
  events: EventWithLinks[]
  recordedEventIds: ReadonlySet<string>
  onEdit: (e: EventWithLinks) => void
  onDelete: (e: EventWithLinks) => void
  onRecord?: (e: EventWithLinks) => void
}) {
  return (
    <Stack gap="xs" w="100%">
      {events.map((e) => (
        <EventItem key={e.id} event={e} recorded={recordedEventIds.has(e.id)} onEdit={onEdit} onDelete={onDelete} onRecord={onRecord} />
      ))}
    </Stack>
  )
}
```

- [ ] **Step 3: `EventForm.tsx`**

```tsx
import { Button, Checkbox, Group, Select, Stack, TextInput, Textarea } from '@mantine/core'
import { DateInput, TimeInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import dayjs from 'dayjs'
import { useState } from 'react'

import { EVENT_KINDS, EVENT_KIND_LABEL } from '../../db/schema'
import { splitStartsAt } from '../../lib/calendar'
import { saveEvent, type EventInput } from '../../server/events'
import type { EventWithLinks, PlaceWithLinks } from '../../server/repository'

type Targets = { vendors: { id: string; name: string }[]; properties: { id: string; name: string }[] }
type Values = Omit<EventInput, 'id'>

export function EventForm({
  event,
  defaults,
  targets,
  places,
  onSaved,
}: {
  event: EventWithLinks | null
  defaults?: Partial<Pick<Values, 'date' | 'placeId' | 'vendorId' | 'propertyId'>>
  targets: Targets
  places: PlaceWithLinks[]
  onSaved: (id: string) => void
}) {
  const router = useRouter()
  const save = useServerFn(saveEvent)
  const [saving, setSaving] = useState(false)
  const initial: Values = event
    ? {
        title: event.title,
        kind: event.kind,
        date: splitStartsAt(event.startsAt).date,
        allDay: event.allDay,
        startTime: splitStartsAt(event.startsAt).time,
        endTime: event.endsAt ? splitStartsAt(event.endsAt).time : null,
        placeId: event.placeId,
        vendorId: event.vendorId,
        propertyId: event.propertyId,
        note: event.note,
      }
    : {
        title: '',
        kind: 'visit',
        date: defaults?.date ?? dayjs().format('YYYY-MM-DD'),
        allDay: false,
        startTime: '10:00',
        endTime: null,
        placeId: defaults?.placeId ?? null,
        vendorId: defaults?.vendorId ?? null,
        propertyId: defaults?.propertyId ?? null,
        note: null,
      }
  const form = useForm<Values>({
    initialValues: initial,
    validate: {
      title: (v) => (v.trim() ? null : 'タイトルは必須です'),
      startTime: (v, values) => (!values.allDay && !v ? '開始時刻を入れてください' : null),
    },
  })

  async function submit(values: Values) {
    setSaving(true)
    try {
      const { id } = await save({ data: { ...(event ? { id: event.id } : {}), ...values } })
      await router.invalidate()
      notifications.show({ message: event ? '予定を更新しました' : '予定を追加しました' })
      onSaved(id)
    } catch {
      notifications.show({ message: '保存できませんでした', color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  // 場所を選んだら、その場所の業者/物件を自動で合わせる（手で変えてもよい）
  function onPlaceChange(placeId: string | null) {
    form.setFieldValue('placeId', placeId)
    const p = places.find((x) => x.id === placeId)
    if (p) {
      form.setFieldValue('vendorId', p.vendorId)
      form.setFieldValue('propertyId', p.propertyId)
    }
  }

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack gap="md">
        <TextInput label="タイトル" required {...form.getInputProps('title')} />
        <Select label="種別" data={EVENT_KINDS.map((k) => ({ value: k, label: EVENT_KIND_LABEL[k] }))} {...form.getInputProps('kind')} />
        <DateInput
          label="日付"
          required
          valueFormat="YYYY-MM-DD"
          value={form.values.date ? new Date(`${form.values.date}T00:00:00`) : null}
          onChange={(d) => form.setFieldValue('date', d ? dayjs(d).format('YYYY-MM-DD') : '')}
        />
        <Checkbox label="終日" {...form.getInputProps('allDay', { type: 'checkbox' })} />
        {!form.values.allDay ? (
          <Group grow>
            <TimeInput label="開始" {...form.getInputProps('startTime')} value={form.values.startTime ?? ''} />
            <TimeInput label="終了" {...form.getInputProps('endTime')} value={form.values.endTime ?? ''} onChange={(e) => form.setFieldValue('endTime', e.currentTarget.value || null)} />
          </Group>
        ) : null}
        <Select label="場所" clearable searchable data={places.map((p) => ({ value: p.id, label: p.name }))} value={form.values.placeId} onChange={onPlaceChange} />
        <Select label="業者" clearable searchable data={targets.vendors.map((v) => ({ value: v.id, label: v.name }))} {...form.getInputProps('vendorId')} />
        <Select label="マンション物件" clearable searchable data={targets.properties.map((p) => ({ value: p.id, label: p.name }))} {...form.getInputProps('propertyId')} />
        <Textarea label="メモ" autosize minRows={2} {...form.getInputProps('note')} value={form.values.note ?? ''} />
        <Button type="submit" loading={saving} fullWidth>
          保存
        </Button>
      </Stack>
    </form>
  )
}
```

`TimeInput` の `onChange` は `ChangeEvent`。`getInputProps` の spread で `startTime` は文字列になる（空は `''` → zod の `timeField.nullable()` で弾かれるので、`submit` の直前に `startTime: values.startTime || null` に正規化する。`endTime` も同様）。`DateInput` は `Date` を扱うので文字列との変換をここで閉じる。

- [ ] **Step 4: 動作確認（Playwright 390×844）**

予定タブ → 今月のカレンダーが出る → 「予定を追加」→ タイトル「テスト見学」・日付は選択日・10:00–11:30・場所を選ぶと業者が自動で入る → 保存 → その日にドットが付き、下のリストに `10:00–11:30 テスト見学` → 編集で終日にして保存 → 「終日」表示 → 削除で消える。月送りで `?m=` が変わり、日付クリックで `?d=` が変わる。Phase 1 で投入した実データの予定がその月に出る（件数のみ報告）。コンソールに hydration 警告が無いこと（`dayjs()` を初期値に使うのは create 時のフォームだけで、SSR の描画には入らない）。

- [ ] **Step 5: 検証とコミット**

```bash
npm run generate-routes && npm run typecheck && npm run test:coverage && npm run format:check && npm run build
git add -A
git commit -m "feat(calendar): 予定タブ（月カレンダー・日別リスト・予定フォーム）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 写真 — lib・R2 ストレージ・アップロード/配信ルート

**Files:**
- Create: `src/lib/photos.ts` `src/lib/photos.test.ts` `src/server/storage.ts` `src/routes/api.photos.tsx` `src/routes/api.photos.$.tsx`
- Modify: `src/server/repository.ts`（photos 関数を追記）`src/server/repository.worker-test.ts`（photos の describe を追記）

**Interfaces:**
- Produces（`src/lib/photos.ts`）: `MAX_PHOTO_BYTES = 2 * 1024 * 1024`／`MAX_PHOTOS_PER_UPLOAD = 20`／`photoKeys(visitId: string, photoId: string): { displayKey: string; thumbKey: string }`（`photos/{visitId}/{photoId}-display.jpg` / `-thumb.jpg`）／`isManagedPhotoKey(key: string): boolean`（`^photos/<uuid形>/<uuid形>-(display|thumb)\.jpg$`）／`sniffImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null`（JPEG `FF D8 FF`、PNG `89 50 4E 47 0D 0A 1A 0A`、WebP `RIFF....WEBP`）／`validatePhotoUpload({ displaySize, thumbSize, width, height }): string | null`（エラー文言 or null: サイズ > 2MB、幅高さが 1..8000 の整数でない）
- Produces（`src/server/storage.ts`）: `getPhotosBucket(): R2Bucket`（`env.PHOTOS`）／`deletePhotoObjects(keys: string[]): Promise<void>`（`bucket.delete(keys)`；空なら何もしない）
- Produces（repository）: `insertPhoto(db, { visitId, displayKey, thumbKey, width, height }, actorEmail): Promise<string>`（`sortOrder` はその visit の現在件数）／`listPhotos(db, visitId): Promise<Photo[]>`（sortOrder 順）／`getPhoto(db, id): Promise<Photo | null>`／`deletePhotoRow(db, id): Promise<Photo | null>`（消した行を返す＝R2 キーの削除に使う）／`photoKeysOfVisit(db, visitId): Promise<string[]>`（display と thumb の全キー）
- Produces（routes）: `POST /api/photos`（multipart: `visitId`, `display`(File), `thumb`(File), `width`, `height`）→ `200 { id }` / `400 { error }` / `404 { error }`（visit なし）／`413`（2 MB 超）／`415`（画像でない）。`GET /api/photos/<key>`（splat）→ R2 からストリーム、`content-type: image/jpeg`、`cache-control: private, max-age=31536000, immutable`、`etag`、`if-none-match` 一致で 304、キー不正/無しは 404

- [ ] **Step 1: `src/lib/photos.test.ts`**

```ts
import { describe, expect, it } from 'vitest'

import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_UPLOAD,
  isManagedPhotoKey,
  photoKeys,
  sniffImageType,
  validatePhotoUpload,
} from './photos'

const V = '11111111-1111-1111-1111-111111111111'
const P = '22222222-2222-2222-2222-222222222222'

describe('photoKeys / isManagedPhotoKey', () => {
  it('visit と photo の id からキーを作り、そのキーだけを管理対象とみなす', () => {
    const k = photoKeys(V, P)
    expect(k).toEqual({ displayKey: `photos/${V}/${P}-display.jpg`, thumbKey: `photos/${V}/${P}-thumb.jpg` })
    expect(isManagedPhotoKey(k.displayKey)).toBe(true)
    expect(isManagedPhotoKey(k.thumbKey)).toBe(true)
    expect(isManagedPhotoKey('backups/x.sql')).toBe(false)
    expect(isManagedPhotoKey(`photos/${V}/${P}-original.jpg`)).toBe(false)
    expect(isManagedPhotoKey(`photos/../${P}-display.jpg`)).toBe(false)
    expect(isManagedPhotoKey('')).toBe(false)
  })
})

describe('sniffImageType', () => {
  it('マジックバイトで JPEG/PNG/WebP を判定し、それ以外は null', () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('image/jpeg')
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe('image/png')
    const webp = new Uint8Array(12)
    webp.set([0x52, 0x49, 0x46, 0x46], 0)
    webp.set([0x57, 0x45, 0x42, 0x50], 8)
    expect(sniffImageType(webp)).toBe('image/webp')
    expect(sniffImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull()
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull()
  })
})

describe('validatePhotoUpload', () => {
  it('上限と寸法を見る', () => {
    expect(MAX_PHOTOS_PER_UPLOAD).toBe(20)
    expect(validatePhotoUpload({ displaySize: 1000, thumbSize: 100, width: 1600, height: 1200 })).toBeNull()
    expect(validatePhotoUpload({ displaySize: MAX_PHOTO_BYTES + 1, thumbSize: 100, width: 1600, height: 1200 })).toMatch(/大きすぎ/)
    expect(validatePhotoUpload({ displaySize: 1000, thumbSize: MAX_PHOTO_BYTES + 1, width: 1600, height: 1200 })).toMatch(/大きすぎ/)
    expect(validatePhotoUpload({ displaySize: 0, thumbSize: 100, width: 1600, height: 1200 })).toMatch(/空/)
    expect(validatePhotoUpload({ displaySize: 1000, thumbSize: 100, width: 0, height: 1200 })).toMatch(/寸法/)
    expect(validatePhotoUpload({ displaySize: 1000, thumbSize: 100, width: 1.5, height: 1200 })).toMatch(/寸法/)
    expect(validatePhotoUpload({ displaySize: 1000, thumbSize: 100, width: 9000, height: 1200 })).toMatch(/寸法/)
  })
})
```

- [ ] **Step 2: 失敗確認** — FAIL

- [ ] **Step 3: `src/lib/photos.ts`**

```ts
/**
 * 写真の R2 キーと受け取り検査。R2 は非公開で、配信は認証後に Worker が
 * ストリームする。キーは `photos/{visitId}/{photoId}-display.jpg` と `-thumb.jpg`。
 * seed 取込（scripts/lib/seed.mjs）も同じ形で置くので、ここを変えたらそちらも変える。
 */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
export const MAX_PHOTOS_PER_UPLOAD = 20
export const MAX_EDGE_PX = 8000

const UUIDISH = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const MANAGED = new RegExp(`^photos/${UUIDISH}/${UUIDISH}-(display|thumb)\\.jpg$`)

export function photoKeys(visitId: string, photoId: string): { displayKey: string; thumbKey: string } {
  return {
    displayKey: `photos/${visitId}/${photoId}-display.jpg`,
    thumbKey: `photos/${visitId}/${photoId}-thumb.jpg`,
  }
}

export function isManagedPhotoKey(key: string): boolean {
  return MANAGED.test(key)
}

export function sniffImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (png.every((b, i) => bytes[i] === b)) return 'image/png'
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}

export function validatePhotoUpload(input: {
  displaySize: number
  thumbSize: number
  width: number
  height: number
}): string | null {
  if (input.displaySize <= 0 || input.thumbSize <= 0) return '画像が空です'
  if (input.displaySize > MAX_PHOTO_BYTES || input.thumbSize > MAX_PHOTO_BYTES) {
    return `画像が大きすぎます（上限 ${MAX_PHOTO_BYTES / 1024 / 1024}MB）`
  }
  for (const n of [input.width, input.height]) {
    if (!Number.isInteger(n) || n < 1 || n > MAX_EDGE_PX) return '画像の寸法が不正です'
  }
  return null
}
```

- [ ] **Step 4: 通過確認** — PASS、`npm run test:coverage` 100%

- [ ] **Step 5: `src/server/storage.ts`**

```ts
import { env } from 'cloudflare:workers'

/**
 * 写真の保管先（R2, バインディング PHOTOS）。公開バケットにはしない。
 * 読み書きするキーは src/lib/photos.ts の isManagedPhotoKey を通ったものだけ。
 */
export function getPhotosBucket(): R2Bucket {
  return env.PHOTOS
}

export async function deletePhotoObjects(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return
  await getPhotosBucket().delete([...keys])
}
```

- [ ] **Step 6: repository の photos 関数（テスト先行）**

`repository.worker-test.ts` に追記:

```ts
import { photos } from '../db/schema'
import { deletePhotoRow, insertPhoto, listPhotos, photoKeysOfVisit } from './repository'

describe('photos', () => {
  it('sortOrder は追加順、削除は行を返し、visit のキー一覧が取れる', async () => {
    const placeId = await upsertPlace(db, { name: 'テスト会場', kind: 'open_house' }, actor)
    const visitId = crypto.randomUUID()
    await db.insert(visits).values({ id: visitId, placeId, visitedOn: '2030-01-05', createdBy: actor })
    const a = await insertPhoto(db, { visitId, displayKey: 'photos/x/a-display.jpg', thumbKey: 'photos/x/a-thumb.jpg', width: 1600, height: 1200 }, actor)
    const b = await insertPhoto(db, { visitId, displayKey: 'photos/x/b-display.jpg', thumbKey: 'photos/x/b-thumb.jpg', width: 1200, height: 1600 }, actor)
    expect((await listPhotos(db, visitId)).map((p) => [p.id, p.sortOrder])).toEqual([[a, 0], [b, 1]])
    expect((await photoKeysOfVisit(db, visitId)).sort()).toEqual(['photos/x/a-display.jpg', 'photos/x/a-thumb.jpg', 'photos/x/b-display.jpg', 'photos/x/b-thumb.jpg'])
    const removed = await deletePhotoRow(db, a)
    expect(removed?.displayKey).toBe('photos/x/a-display.jpg')
    expect(await deletePhotoRow(db, a)).toBeNull()
    expect((await listPhotos(db, visitId)).map((p) => p.id)).toEqual([b])
  })

  it('visit を消すと photos は cascade で消える', async () => {
    const visitId = crypto.randomUUID()
    await db.insert(visits).values({ id: visitId, visitedOn: '2030-01-05', createdBy: actor })
    await insertPhoto(db, { visitId, displayKey: 'photos/y/c-display.jpg', thumbKey: 'photos/y/c-thumb.jpg', width: 10, height: 10 }, actor)
    await db.delete(visits).where(eq(visits.id, visitId))
    expect(await db.select().from(photos)).toHaveLength(0)
  })
})
```

`repository.ts` に追記:

```ts
import { photos, type Photo } from '../db/schema'

export async function insertPhoto(
  db: Db,
  input: { id?: string; visitId: string; displayKey: string; thumbKey: string; width: number; height: number },
  actorEmail: string,
): Promise<string> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(photos)
    .where(eq(photos.visitId, input.visitId))
  const { id: givenId, ...values } = input
  const id = givenId ?? crypto.randomUUID()
  await db.insert(photos).values({ ...values, id, sortOrder: Number(n ?? 0), createdBy: actorEmail })
  return id
}

export async function listPhotos(db: Db, visitId: string): Promise<Photo[]> {
  return db.select().from(photos).where(eq(photos.visitId, visitId)).orderBy(asc(photos.sortOrder), asc(photos.createdAt))
}

export async function getPhoto(db: Db, id: string): Promise<Photo | null> {
  const [row] = await db.select().from(photos).where(eq(photos.id, id)).limit(1)
  return row ?? null
}

/** 行を消して返す（R2 のキーを消す側で使う）。無ければ null */
export async function deletePhotoRow(db: Db, id: string): Promise<Photo | null> {
  const row = await getPhoto(db, id)
  if (!row) return null
  await db.delete(photos).where(eq(photos.id, id))
  return row
}

export async function photoKeysOfVisit(db: Db, visitId: string): Promise<string[]> {
  const rows = await db.select({ d: photos.displayKey, t: photos.thumbKey }).from(photos).where(eq(photos.visitId, visitId))
  return rows.flatMap((r) => [r.d, r.t])
}
```

`npm run test:server` → PASS。

- [ ] **Step 7: `src/routes/api.photos.tsx`（アップロード）**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { visits } from '../db/schema'
import { isIdLike } from '../lib/ids'
import { photoKeys, sniffImageType, validatePhotoUpload } from '../lib/photos'
import { securityHeadersInit } from '../lib/securityHeaders'
import { currentActorEmail } from '../server/members'
import { insertPhoto } from '../server/repository'
import { getPhotosBucket } from '../server/storage'

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: securityHeadersInit({ 'content-type': 'application/json; charset=utf-8' }),
  })
}

/**
 * 写真 1 枚のアップロード（表示用 + サムネの 2 ファイル）。端末側で縮小済み。
 * multipart を受けるため server function ではなくサーバールート。
 * 認証は src/start.ts のグローバルミドルウェアが適用済み。
 */
export const Route = createFileRoute('/api/photos')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData()
        const visitId = String(form.get('visitId') ?? '')
        const display = form.get('display')
        const thumb = form.get('thumb')
        const width = Number(form.get('width'))
        const height = Number(form.get('height'))

        if (!isIdLike(visitId)) return json(400, { error: '見学記録の指定が不正です' })
        if (!(display instanceof File) || !(thumb instanceof File)) return json(400, { error: '画像を選んでください' })
        const problem = validatePhotoUpload({ displaySize: display.size, thumbSize: thumb.size, width, height })
        if (problem) return json(problem.includes('大きすぎ') ? 413 : 400, { error: problem })

        const [displayBytes, thumbBytes] = await Promise.all([display.arrayBuffer(), thumb.arrayBuffer()])
        const type = sniffImageType(new Uint8Array(displayBytes).subarray(0, 16))
        const thumbType = sniffImageType(new Uint8Array(thumbBytes).subarray(0, 16))
        if (!type || !thumbType) return json(415, { error: '画像ファイルではありません' })

        const db = getDb()
        const [visit] = await db.select({ id: visits.id }).from(visits).where(eq(visits.id, visitId)).limit(1)
        if (!visit) return json(404, { error: '見学記録が見つかりません' })

        const actor = await currentActorEmail()
        const photoId = crypto.randomUUID()
        const keys = photoKeys(visitId, photoId)
        const bucket = getPhotosBucket()
        await bucket.put(keys.displayKey, displayBytes, { httpMetadata: { contentType: type } })
        await bucket.put(keys.thumbKey, thumbBytes, { httpMetadata: { contentType: thumbType } })
        try {
          await insertPhoto(db, { id: photoId, visitId, ...keys, width, height }, actor)
        } catch (error) {
          await bucket.delete([keys.displayKey, keys.thumbKey])
          throw error
        }
        return json(200, { id: photoId, ...keys })
      },
    },
  },
})
```

`insertPhoto` に `id: photoId` を渡すので、R2 のキーと DB の id が一致する（Step 6 の `id?: string` 引数）。

- [ ] **Step 8: `src/routes/api.photos.$.tsx`（配信）**

```tsx
import { createFileRoute } from '@tanstack/react-router'

import { isManagedPhotoKey } from '../lib/photos'
import { securityHeadersInit } from '../lib/securityHeaders'
import { getPhotosBucket } from '../server/storage'

/**
 * 写真の配信。バケットは非公開のまま、認証を通ったリクエストだけ Worker 経由で流す。
 * キーは photos/{visitId}/{photoId}-display.jpg 形式のみ（バックアップ等は配らない）。
 */
export const Route = createFileRoute('/api/photos/$')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const key = `photos/${params._splat ?? ''}`
        if (!isManagedPhotoKey(key)) return new Response('Not Found', { status: 404 })
        const object = await getPhotosBucket().get(key)
        if (!object) return new Response('Not Found', { status: 404 })
        const etag = object.httpEtag
        if (request.headers.get('if-none-match') === etag) {
          return new Response(null, { status: 304, headers: securityHeadersInit({ etag }) })
        }
        return new Response(object.body, {
          headers: securityHeadersInit({
            'content-type': object.httpMetadata?.contentType ?? 'image/jpeg',
            'content-length': String(object.size),
            'cache-control': 'private, max-age=31536000, immutable',
            etag,
          }),
        })
      },
    },
  },
})
```

TanStack Router のスプラットは `$` ファイル名で `params._splat`。`npm run generate-routes` 後に `routeTree.gen.ts` に `/api/photos/$` が出ることを確認する。

- [ ] **Step 9: 動作確認（curl・dev サーバー）**

```bash
npm run dev &   # ポートは表示を読む
# 400（visitId 不正）
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Origin: http://localhost:3000' -F visitId=bad -F display=@public/logo192.png -F thumb=@public/logo192.png -F width=192 -F height=192 http://localhost:3000/api/photos
# seed 由来の visit id を 1 つ D1 から取り（値はレポートに書かない）、200 と返ってきたキーで GET が 200 / if-none-match で 304 / 不正キーで 404
```

ローカル D1 に seed が入っているので、`npx wrangler d1 execute sumai-log --local --json --command "select id from visits limit 1"` で id を取って使う。GET は `/api/photos/<visitId>/<photoId>-display.jpg`（`photos/` プレフィックスはルートが付ける）。

- [ ] **Step 10: 検証とコミット**

```bash
npm run generate-routes && npm run typecheck && npm run test:coverage && npm run test:server && npm run format:check && npm run build
git add -A
git commit -m "feat(photos): 写真の R2 キー/検査と アップロード・配信ルート

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: server — 見学記録（visits）とコメント（comments）

**Files:**
- Create: `src/server/visits.ts` `src/server/comments.ts`
- Modify: `src/server/repository.ts`（visits / comments 関数を追記）`src/server/repository.worker-test.ts`（describe を追記）

**Interfaces:**
- Produces（repository）: `upsertVisit(db, input: VisitInput, actorEmail): Promise<string>`／`deleteVisitCascade(db, id): Promise<string[]>`（消す前に `photoKeysOfVisit` で R2 キーを集めて返す。photos 行は FK cascade）／`listVisitsWithLinks(db)` → `Visit & { placeName; vendorName; propertyName; photoCount: number; firstThumbKey: string | null }`（新しい順）；型 `VisitWithLinks`／`getVisitDetail(db, id)` → `{ visit, place, vendor, property, event, photos } | null`／`listComments(db, targetType, targetId): Promise<Comment[]>`（古い順）／`insertComment(db, { targetType, targetId, body }, actorEmail): Promise<string>`／`deleteOwnComment(db, id, actorEmail): Promise<boolean>`（自分のコメントだけ消せる）
- Produces（`src/server/visits.ts`）: `visitInput`（zod: `{ id?, eventId: idField|null, placeId: idField|null, vendorId: idField|null, propertyId: idField|null, visitedOn: dateField, attendees: ATTENDEES, good: optionalText, concerns: optionalText, qa: optionalText, nextActions: optionalText }`）／`VisitInput`／`listVisits()` → `VisitWithLinks[]`／`getVisit({ data: { id } })` → detail（404 は Response throw）／`saveVisit` → `{ id }`／`deleteVisit` → R2 の写真も消す／`deletePhoto({ data: { id } })` → 行と R2 の 2 オブジェクトを消す／`visitFormOptions()` → `{ targets, places, events: Event[] }`（フォームの選択肢。events は直近 180 日）
- Produces（`src/server/comments.ts`）: `commentInput`（`{ targetType: COMMENT_TARGETS, targetId: idField, body: 1..2000 }`）／`listCommentsFor({ data: { targetType, targetId } })` → `{ comments: Comment[]; me: string; members: Member[] }`／`addComment` → `{ id }`／`deleteComment` → `{ ok: boolean }`
- Note: `visits.placeId` は仕様上 NOT NULL だが Phase 1 のスキーマでは nullable。**ここでは nullable のまま**（seed に場所なしの記録は無いが、フォームでは場所を必須にしない＝業者だけ決まっている打合せの記録も書けるようにする）。

- [ ] **Step 1: repository テストを追記（FAIL → 実装 → PASS）**

```ts
import { comments } from '../db/schema'
import {
  deleteOwnComment, deleteVisitCascade, getVisitDetail, insertComment, listComments, listVisitsWithLinks, upsertVisit,
} from './repository'

describe('visits', () => {
  it('一覧は新しい順で場所名・写真数・先頭サムネが付き、削除で R2 キーを返す', async () => {
    const placeId = await upsertPlace(db, { name: 'テスト会場', kind: 'open_house' }, actor)
    const older = await upsertVisit(db, { placeId, visitedOn: '2030-01-05', attendees: 'both' }, actor)
    const newer = await upsertVisit(db, { placeId, visitedOn: '2030-01-08', attendees: 'wife' }, actor)
    await insertPhoto(db, { visitId: older, displayKey: 'photos/o/1-display.jpg', thumbKey: 'photos/o/1-thumb.jpg', width: 10, height: 10 }, actor)
    await insertPhoto(db, { visitId: older, displayKey: 'photos/o/2-display.jpg', thumbKey: 'photos/o/2-thumb.jpg', width: 10, height: 10 }, actor)
    const rows = await listVisitsWithLinks(db)
    expect(rows.map((r) => [r.id, r.placeName, r.photoCount, r.firstThumbKey])).toEqual([
      [newer, 'テスト会場', 0, null],
      [older, 'テスト会場', 2, 'photos/o/1-thumb.jpg'],
    ])
    const keys = await deleteVisitCascade(db, older)
    expect(keys.sort()).toEqual(['photos/o/1-display.jpg', 'photos/o/1-thumb.jpg', 'photos/o/2-display.jpg', 'photos/o/2-thumb.jpg'])
    expect(await db.select().from(photos)).toHaveLength(0)
  })

  it('詳細は関連と写真をまとめて返し、無ければ null', async () => {
    const vendorId = await upsertVendor(db, { name: '甲工務店', kind: 'koumuten', serviceAreas: [] }, actor)
    const id = await upsertVisit(db, { vendorId, visitedOn: '2030-01-05', attendees: 'husband', good: 'よかった' }, actor)
    const d = await getVisitDetail(db, id)
    expect(d?.visit.good).toBe('よかった')
    expect(d?.vendor?.name).toBe('甲工務店')
    expect(d?.place).toBeNull()
    expect(d?.photos).toEqual([])
    expect(await getVisitDetail(db, crypto.randomUUID())).toBeNull()
  })
})

describe('comments', () => {
  it('古い順に並び、自分のものだけ消せる', async () => {
    const target = crypto.randomUUID()
    const a = await insertComment(db, { targetType: 'visit', targetId: target, body: '一言' }, actor)
    const b = await insertComment(db, { targetType: 'visit', targetId: target, body: '二言' }, 'partner@example.com')
    expect((await listComments(db, 'visit', target)).map((c) => c.id)).toEqual([a, b])
    expect(await deleteOwnComment(db, b, actor)).toBe(false)
    expect(await deleteOwnComment(db, b, 'partner@example.com')).toBe(true)
    expect(await listComments(db, 'visit', target)).toHaveLength(1)
    expect(await db.select().from(comments)).toHaveLength(1)
  })
})
```

`reset()` に `comments` が含まれることを確認（Phase 1 で含めてある）。

- [ ] **Step 2: `repository.ts` に追記**

```ts
import { comments, type Comment, type NewVisit } from '../db/schema'

type VisitInput = Omit<NewVisit, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & { id?: string }

export async function upsertVisit(db: Db, input: VisitInput, actorEmail: string): Promise<string> {
  const { id, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(visits).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  await db.update(visits).set({ ...values, updatedAt: new Date().toISOString() }).where(eq(visits.id, id))
  return id
}

/** 見学記録を消す。写真行は FK cascade。R2 のキーを返すので呼び側で消す */
export async function deleteVisitCascade(db: Db, id: string): Promise<string[]> {
  const keys = await photoKeysOfVisit(db, id)
  await db.delete(visits).where(eq(visits.id, id))
  return keys
}

export async function listVisitsWithLinks(db: Db) {
  const rows = await db
    .select({
      visit: visits,
      placeName: places.name,
      vendorName: vendors.name,
      propertyName: properties.name,
      photoCount: sql<number>`(select count(*) from photos p where p.visit_id = ${visits.id})`,
      firstThumbKey: sql<string | null>`(select p.thumb_key from photos p where p.visit_id = ${visits.id} order by p.sort_order asc, p.created_at asc limit 1)`,
    })
    .from(visits)
    .leftJoin(places, eq(visits.placeId, places.id))
    .leftJoin(vendors, eq(visits.vendorId, vendors.id))
    .leftJoin(properties, eq(visits.propertyId, properties.id))
    .orderBy(desc(visits.visitedOn), desc(visits.createdAt))
  return rows.map((r) => ({
    ...r.visit,
    placeName: r.placeName ?? null,
    vendorName: r.vendorName ?? null,
    propertyName: r.propertyName ?? null,
    photoCount: Number(r.photoCount ?? 0),
    firstThumbKey: r.firstThumbKey ?? null,
  }))
}
export type VisitWithLinks = Awaited<ReturnType<typeof listVisitsWithLinks>>[number]

export async function getVisitDetail(db: Db, id: string) {
  const [visit] = await db.select().from(visits).where(eq(visits.id, id)).limit(1)
  if (!visit) return null
  const [place] = visit.placeId ? await db.select().from(places).where(eq(places.id, visit.placeId)).limit(1) : []
  const [vendor] = visit.vendorId ? await db.select().from(vendors).where(eq(vendors.id, visit.vendorId)).limit(1) : []
  const [property] = visit.propertyId ? await db.select().from(properties).where(eq(properties.id, visit.propertyId)).limit(1) : []
  const [event] = visit.eventId ? await db.select().from(events).where(eq(events.id, visit.eventId)).limit(1) : []
  const photoRows = await listPhotos(db, id)
  return { visit, place: place ?? null, vendor: vendor ?? null, property: property ?? null, event: event ?? null, photos: photoRows }
}
export type VisitDetail = NonNullable<Awaited<ReturnType<typeof getVisitDetail>>>

export async function listComments(db: Db, targetType: Comment['targetType'], targetId: string): Promise<Comment[]> {
  return db
    .select()
    .from(comments)
    .where(and(eq(comments.targetType, targetType), eq(comments.targetId, targetId)))
    .orderBy(asc(comments.createdAt))
}

export async function insertComment(
  db: Db,
  input: { targetType: Comment['targetType']; targetId: string; body: string },
  actorEmail: string,
): Promise<string> {
  const id = crypto.randomUUID()
  await db.insert(comments).values({ ...input, id, createdBy: actorEmail })
  return id
}

/** 自分のコメントだけ消せる。消せたら true */
export async function deleteOwnComment(db: Db, id: string, actorEmail: string): Promise<boolean> {
  const [row] = await db.select({ createdBy: comments.createdBy }).from(comments).where(eq(comments.id, id)).limit(1)
  if (!row || row.createdBy !== actorEmail) return false
  await db.delete(comments).where(eq(comments.id, id))
  return true
}
```

（`desc` `and` を drizzle-orm から import に足す）

- [ ] **Step 3: `src/server/visits.ts`**

```ts
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDb } from '../db/client'
import { ATTENDEES } from '../db/schema'
import { dateKey } from '../lib/calendar'
import { nowJstIso } from './events'
import { currentActorEmail } from './members'
import {
  deletePhotoRow,
  deleteVisitCascade,
  getVisitDetail,
  listEventsBetween,
  listPlacesWithLinks,
  listVisitsWithLinks,
  upsertVisit,
} from './repository'
import { deletePhotoObjects } from './storage'
import { dateField, idField, idInput, optionalText } from './zod'
import { listLinkTargets } from './places'

export const visitInput = z.object({
  id: idField.optional(),
  eventId: idField.nullable(),
  placeId: idField.nullable(),
  vendorId: idField.nullable(),
  propertyId: idField.nullable(),
  visitedOn: dateField,
  attendees: z.enum(ATTENDEES),
  good: optionalText,
  concerns: optionalText,
  qa: optionalText,
  nextActions: optionalText,
})
export type VisitInput = z.input<typeof visitInput>

export const listVisits = createServerFn().handler(async () => listVisitsWithLinks(getDb()))

export const getVisit = createServerFn()
  .validator(idInput)
  .handler(async ({ data }) => {
    const detail = await getVisitDetail(getDb(), data.id)
    if (!detail) throw new Response('Not Found', { status: 404 })
    return detail
  })

export const saveVisit = createServerFn({ method: 'POST' })
  .validator(visitInput)
  .handler(async ({ data }) => ({ id: await upsertVisit(getDb(), data, await currentActorEmail()) }))

export const deleteVisit = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    const keys = await deleteVisitCascade(getDb(), data.id)
    await deletePhotoObjects(keys)
    return { ok: true as const }
  })

export const deletePhoto = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    const row = await deletePhotoRow(getDb(), data.id)
    if (row) await deletePhotoObjects([row.displayKey, row.thumbKey])
    return { ok: row !== null }
  })

/** 見学記録フォームの選択肢。予定は直近 180 日 */
export const visitFormOptions = createServerFn().handler(async () => {
  const db = getDb()
  const today = dateKey(nowJstIso())
  const from = dateKey(new Date(Date.parse(today) - 180 * 86400000).toISOString())
  const to = dateKey(new Date(Date.parse(today) + 30 * 86400000).toISOString())
  const [targets, places, events] = await Promise.all([
    listLinkTargets(),
    listPlacesWithLinks(db),
    listEventsBetween(db, from, to),
  ])
  return { targets, places, events }
})
```

- [ ] **Step 4: `src/server/comments.ts`**

```ts
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDb } from '../db/client'
import { COMMENT_TARGETS } from '../db/schema'
import { allMembers, currentActorEmail } from './members'
import { deleteOwnComment, insertComment, listComments } from './repository'
import { idField, idInput } from './zod'

const target = z.object({ targetType: z.enum(COMMENT_TARGETS), targetId: idField })

export const commentInput = target.extend({
  body: z.string().trim().min(1, '本文を入れてください').max(2000),
})

export const listCommentsFor = createServerFn()
  .validator(target)
  .handler(async ({ data }) => ({
    comments: await listComments(getDb(), data.targetType, data.targetId),
    me: await currentActorEmail(),
    members: allMembers(),
  }))

export const addComment = createServerFn({ method: 'POST' })
  .validator(commentInput)
  .handler(async ({ data }) => ({ id: await insertComment(getDb(), data, await currentActorEmail()) }))

export const deleteComment = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => ({ ok: await deleteOwnComment(getDb(), data.id, await currentActorEmail()) }))
```

- [ ] **Step 5: 検証とコミット**

```bash
npm run typecheck && npm run test:coverage && npm run test:server && npm run format:check
git add -A
git commit -m "feat(server): 見学記録とコメントの repository / server function

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 記録タブ — 見学記録の一覧・詳細・フォーム・写真アップロード

**Files:**
- Modify: `src/routes/records.tsx`（プレースホルダを置換）
- Create: `src/routes/records_.visits.$id.tsx` `src/components/visits/VisitCard.tsx` `src/components/visits/VisitForm.tsx` `src/components/visits/PhotoUploader.tsx` `src/components/visits/PhotoGrid.tsx` `src/lib/imageResize.ts`（純粋な寸法計算のみ）`src/lib/imageResize.test.ts`

**Interfaces:**
- Consumes: `listVisits` `getVisit` `saveVisit` `deleteVisit` `deletePhoto` `visitFormOptions` `visitInput` `VisitInput`（Task 5）、`POST /api/photos` `GET /api/photos/<key>`（Task 4）、`MAX_PHOTOS_PER_UPLOAD` `MAX_PHOTO_BYTES`（Task 4）、`ATTENDEES_LABEL` `PLACE_KIND_LABEL`（schema）、`Fab` `FormDrawer` `EmptyState` `PageShell` `Row` `MemberChip`
- Produces（`src/lib/imageResize.ts`）: `fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number }`（長辺を maxEdge に収める。拡大はしない。整数に丸める）
- Produces: `VisitForm({ visit: Visit | null, options, defaults?: { eventId?, placeId?, vendorId?, propertyId?, visitedOn? }, onSaved })`、`PhotoUploader({ visitId, onUploaded })`（内部で縮小→POST、進捗 `n/total` 表示、失敗した枚数を通知）、`PhotoGrid({ photos, onDelete })`（サムネのグリッド。タップで `Modal fullScreen` に表示用画像）、`VisitCard({ visit })`
- 写真の URL は `/api/photos/${key.slice('photos/'.length)}`（ルートが `photos/` を付け直す）。ヘルパ `photoUrl(key)` を `src/lib/photos.ts` に足す（純粋・テスト 1 件）

- [ ] **Step 1: `src/lib/imageResize.ts`（TDD）と `photoUrl`**

```ts
// imageResize.test.ts
import { describe, expect, it } from 'vitest'
import { fitWithin } from './imageResize'
describe('fitWithin', () => {
  it('長辺を上限に収め、縦横比を保ち、拡大しない', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3024, 4032, 400)).toEqual({ width: 300, height: 400 })
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1000, 333, 100)).toEqual({ width: 100, height: 33 })
  })
})
// imageResize.ts
export function fitWithin(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}
```

`src/lib/photos.ts` に `export function photoUrl(key: string): string { return `/api/photos/${key.replace(/^photos\//, '')}` }` を足し、`photos.test.ts` に `expect(photoUrl('photos/a/b-thumb.jpg')).toBe('/api/photos/a/b-thumb.jpg')` を足す。

- [ ] **Step 2: `PhotoUploader.tsx`（端末側縮小 → 1 枚ずつ POST）**

```tsx
import { Button, FileButton, Group, Progress, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Camera } from 'lucide-react'
import { useState } from 'react'

import { fitWithin } from '../../lib/imageResize'
import { MAX_PHOTOS_PER_UPLOAD } from '../../lib/photos'

async function toJpeg(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bitmap, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('toBlob')
  return { blob, width, height }
}

/** 1 枚を 1600px と 400px に縮小して送る。EXIF の向きは createImageBitmap が既定で反映する */
async function uploadOne(visitId: string, file: File): Promise<void> {
  const bitmap = await createImageBitmap(file)
  try {
    const display = await toJpeg(bitmap, 1600, 0.8)
    const thumb = await toJpeg(bitmap, 400, 0.8)
    const form = new FormData()
    form.set('visitId', visitId)
    form.set('display', display.blob, 'display.jpg')
    form.set('thumb', thumb.blob, 'thumb.jpg')
    form.set('width', String(display.width))
    form.set('height', String(display.height))
    const res = await fetch('/api/photos', { method: 'POST', body: form })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }
  } finally {
    bitmap.close()
  }
}

export function PhotoUploader({ visitId, onUploaded }: { visitId: string; onUploaded: () => void }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  async function handleFiles(files: File[]) {
    if (files.length === 0) return
    const batch = files.slice(0, MAX_PHOTOS_PER_UPLOAD)
    if (files.length > batch.length) {
      notifications.show({ message: `1 回に上げられるのは ${MAX_PHOTOS_PER_UPLOAD} 枚までです。先頭 ${batch.length} 枚を送ります。`, color: 'orange' })
    }
    setProgress({ done: 0, total: batch.length })
    let failed = 0
    for (const [i, file] of batch.entries()) {
      try {
        await uploadOne(visitId, file)
      } catch {
        failed += 1
      }
      setProgress({ done: i + 1, total: batch.length })
    }
    setProgress(null)
    notifications.show({
      message: failed === 0 ? `${batch.length} 枚を追加しました` : `${batch.length - failed} 枚を追加、${failed} 枚は失敗しました`,
      color: failed === 0 ? undefined : 'red',
    })
    onUploaded()
  }

  return (
    <Stack gap="xs">
      <Group>
        <FileButton onChange={handleFiles} accept="image/*" multiple>
          {(props) => (
            <Button {...props} leftSection={<Camera size={18} aria-hidden />} loading={progress !== null}>
              写真を追加
            </Button>
          )}
        </FileButton>
      </Group>
      {progress ? (
        <Stack gap={4}>
          <Progress value={(progress.done / progress.total) * 100} />
          <Text size="xs" c="dimmed">
            {progress.done} / {progress.total} 枚
          </Text>
        </Stack>
      ) : null}
    </Stack>
  )
}
```

`FileButton` の `accept="image/*"`（`image/heic` を書かない）。`createImageBitmap` は HEIC を直接読めないが、iOS Safari は `accept="image/*"` の選択時に JPEG へ変換して渡す。

- [ ] **Step 3: `PhotoGrid.tsx`**

```tsx
import { ActionIcon, Image, Modal, SimpleGrid, Stack, Text } from '@mantine/core'
import { Trash2, X } from 'lucide-react'
import { useState } from 'react'

import type { Photo } from '../../db/schema'
import { photoUrl } from '../../lib/photos'

export function PhotoGrid({ photos, onDelete }: { photos: Photo[]; onDelete: (p: Photo) => void }) {
  const [open, setOpen] = useState<Photo | null>(null)
  if (photos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        写真はまだありません。
      </Text>
    )
  }
  return (
    <>
      <SimpleGrid cols={{ base: 3, sm: 4 }} spacing="xs">
        {photos.map((p) => (
          <Image
            key={p.id}
            src={photoUrl(p.thumbKey)}
            alt={p.caption ?? '見学の写真'}
            radius="md"
            fit="cover"
            h={110}
            loading="lazy"
            style={{ cursor: 'zoom-in' }}
            onClick={() => setOpen(p)}
          />
        ))}
      </SimpleGrid>
      <Modal opened={open !== null} onClose={() => setOpen(null)} fullScreen withCloseButton={false} padding={0}>
        {open ? (
          <Stack gap={0} h="100dvh" justify="center" bg="black" pos="relative">
            <ActionIcon variant="filled" color="dark" aria-label="閉じる" pos="absolute" top={12} right={12} onClick={() => setOpen(null)}>
              <X size={18} />
            </ActionIcon>
            <ActionIcon variant="filled" color="red" aria-label="この写真を削除" pos="absolute" top={12} left={12} onClick={() => { onDelete(open); setOpen(null) }}>
              <Trash2 size={18} />
            </ActionIcon>
            <Image src={photoUrl(open.displayKey)} alt={open.caption ?? '見学の写真'} fit="contain" mah="100dvh" />
          </Stack>
        ) : null}
      </Modal>
    </>
  )
}
```

- [ ] **Step 4: `VisitForm.tsx` と `VisitCard.tsx`**

`VisitForm`: `useForm<Omit<VisitInput,'id'>>`。項目順: 日付（`DateInput`、`visitedOn` 文字列と相互変換）・同行（`SegmentedControl` 二人/夫/妻、`ATTENDEES_LABEL`）・予定（`Select` clearable、`options.events` を `${dateKey(startsAt)} ${title}` で表示。選ぶと place/vendor/property/visitedOn をその予定から補完）・場所（`Select`）・業者・マンション物件・良かった点・気になった点・聞いたことと答え・次にやること（`Textarea autosize minRows={3}`）・保存。保存は `saveVisit` → `router.invalidate()` → 通知 → `onSaved(id)`; `catch` で赤通知; `finally` で `saving` を戻す。null 許容の Textarea は `value={... ?? ''}`。

`VisitCard`: `Link to="/records/visits/$id"` で包んだ `Card`。左に `firstThumbKey` があれば `Image`（`photoUrl`、80×80、`fit="cover"`）無ければグレーの枠に `Camera` アイコン、右に `visitedOn`・`placeName ?? vendorName ?? propertyName`・`Badge` 同行（`ATTENDEES_LABEL`）・`photoCount > 0 ? \`${photoCount} 枚\` : null`。

- [ ] **Step 5: `src/routes/records.tsx`**

```tsx
import { SegmentedControl, SimpleGrid, Stack } from '@mantine/core'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'

import { EmptyState } from '../components/EmptyState'
import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { VisitCard } from '../components/visits/VisitCard'
import { VisitForm } from '../components/visits/VisitForm'
import { UUID_SHAPE } from '../lib/ids'
import { dateKey } from '../lib/calendar'
import { listVisits, visitFormOptions } from '../server/visits'

const search = z.object({
  tab: z.enum(['visits', 'videos']).default('visits'),
  // 予定から「記録を書く」で来たとき: その予定を初期値にしてフォームを開く
  fromEvent: z.string().regex(UUID_SHAPE).optional(),
})

export const Route = createFileRoute('/records')({
  component: Page,
  validateSearch: (s) => search.parse(s),
  loader: async () => {
    const [visits, options] = await Promise.all([listVisits(), visitFormOptions()])
    return { visits, options }
  },
})

function Page() {
  const { visits, options } = Route.useLoaderData()
  const { tab, fromEvent } = Route.useSearch()
  const navigate = useNavigate({ from: '/records' })
  const [opened, setOpened] = useState(fromEvent !== undefined)
  const fromEventRow = fromEvent ? options.events.find((e) => e.id === fromEvent) : undefined

  function close() {
    setOpened(false)
    if (fromEvent) navigate({ search: (s) => ({ ...s, fromEvent: undefined }) })
  }

  return (
    <PageShell title="記録">
      <Stack gap="md">
        <SegmentedControl
          fullWidth
          value={tab}
          onChange={(v) => navigate({ search: (s) => ({ ...s, tab: v as 'visits' | 'videos' }) })}
          data={[
            { value: 'visits', label: `見学記録 ${visits.length}` },
            { value: 'videos', label: 'YouTube' },
          ]}
        />
        {tab === 'videos' ? (
          <EmptyState title="準備中" description="YouTube のメモは次の段階で追加します。" />
        ) : visits.length === 0 ? (
          <EmptyState title="見学記録がありません" description="右下の追加から書けます。予定タブの「記録を書く」からも開けます。" />
        ) : (
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {visits.map((v) => (
              <VisitCard key={v.id} visit={v} />
            ))}
          </SimpleGrid>
        )}
      </Stack>
      {tab === 'visits' ? <Fab label="記録を書く" onClick={() => setOpened(true)} /> : null}
      <FormDrawer opened={opened} onClose={close} title="見学記録を書く">
        <VisitForm
          visit={null}
          options={options}
          defaults={
            fromEventRow
              ? {
                  eventId: fromEventRow.id,
                  placeId: fromEventRow.placeId ?? undefined,
                  vendorId: fromEventRow.vendorId ?? undefined,
                  propertyId: fromEventRow.propertyId ?? undefined,
                  visitedOn: dateKey(fromEventRow.startsAt),
                }
              : undefined
          }
          onSaved={(id) => {
            close()
            navigate({ to: '/records/visits/$id', params: { id } })
          }}
        />
      </FormDrawer>
    </PageShell>
  )
}
```

- [ ] **Step 6: `src/routes/records_.visits.$id.tsx`（詳細）**

`loader: ({ params }) => Promise.all([getVisit({ data: { id } }), visitFormOptions()])`。表示: 見出し `visitedOn`＋同行バッジ、`Row` で 場所（`/places/$id` リンク）／業者（`/candidates/vendors/$id`）／物件／予定（`title`）、4 つの本文ブロック（見出し 良かった点・気になった点・聞いたことと答え・次にやること。空は「—」）、**写真**セクション（`PhotoUploader visitId` → `onUploaded={() => router.invalidate()}` と `PhotoGrid photos onDelete`（`window.confirm` → `deletePhoto` → invalidate → 通知））、コメント（Task 7 で `CommentThread` を差し込む。ここでは見出しだけ置かない）、編集（`FormDrawer` + `VisitForm visit={visit}`）、削除（`window.confirm('見学記録と写真を削除します')` → `deleteVisit` → `/records` へ）。`ActionIcon` に `aria-label`。ファイル名は `records_.` で非ネスト（`records.tsx` に Outlet が無い）。

- [ ] **Step 7: 動作確認（Playwright 390×844 + デスクトップ）**

(1) 記録タブに Phase 1 で投入した見学記録が出る（件数のみ報告；写真ありのカードにサムネが出る＝配信ルートが動いている証拠）。(2) 「記録を書く」→ 予定を選ぶと日付と場所が補完される → 保存 → 詳細へ。(3) 詳細で「写真を追加」→ Playwright の `browser_file_upload` で `public/logo512.png` を 2 枚上げる → 進捗 → グリッドに 2 枚 → タップで全画面 → 削除で 1 枚に。(4) 編集で「良かった点」を書いて保存。(5) 削除で一覧へ戻り、R2 のオブジェクトが消えていること（`npx wrangler r2 object get sumai-log-photos/<key> --local` が 404 相当）。(6) 予定タブの「記録あり」バッジが、記録を書いた予定に付く。コンソール clean。

- [ ] **Step 8: 検証とコミット**

```bash
npm run generate-routes && npm run typecheck && npm run test:coverage && npm run format:check && npm run build
git add -A
git commit -m "feat(records): 見学記録の一覧・詳細・フォームと写真アップロード

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: コメント（二人の一言）を記録・候補・場所の詳細に付ける

**Files:**
- Create: `src/components/comments/CommentThread.tsx`
- Modify: `src/routes/records_.visits.$id.tsx` `src/routes/candidates_.vendors.$id.tsx` `src/routes/candidates_.properties.$id.tsx` `src/routes/places.$id.tsx`（各 loader に `listCommentsFor` を足し、ページ末尾に `CommentThread` を置く）

**Interfaces:**
- Consumes: `listCommentsFor` `addComment` `deleteComment`（Task 5）、`MemberChip`、`findMember`
- Produces: `CommentThread({ targetType, targetId, comments, me, members })`

- [ ] **Step 1: `CommentThread.tsx`**

```tsx
import { ActionIcon, Button, Card, Group, Stack, Text, Textarea, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import type { COMMENT_TARGETS, Comment } from '../../db/schema'
import type { Member } from '../../lib/members'
import { addComment, deleteComment } from '../../server/comments'
import { MemberChip } from '../MemberChip'

export function CommentThread({
  targetType,
  targetId,
  comments,
  me,
  members,
}: {
  targetType: (typeof COMMENT_TARGETS)[number]
  targetId: string
  comments: Comment[]
  me: string
  members: Member[]
}) {
  const router = useRouter()
  const add = useServerFn(addComment)
  const remove = useServerFn(deleteComment)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!body.trim()) return
    setSaving(true)
    try {
      await add({ data: { targetType, targetId, body } })
      setBody('')
      await router.invalidate()
    } catch {
      notifications.show({ message: '送信できませんでした', color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c: Comment) {
    if (!window.confirm('このコメントを削除します。')) return
    try {
      const { ok } = await remove({ data: { id: c.id } })
      if (!ok) notifications.show({ message: '自分のコメントだけ削除できます', color: 'orange' })
      await router.invalidate()
    } catch {
      notifications.show({ message: '削除できませんでした', color: 'red' })
    }
  }

  return (
    <Stack gap="sm">
      <Title order={2}>コメント</Title>
      {comments.length === 0 ? (
        <Text size="sm" c="dimmed">
          まだコメントはありません。
        </Text>
      ) : (
        comments.map((c) => (
          <Card key={c.id} withBorder padding="sm">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={4} style={{ minWidth: 0 }}>
                <Group gap="xs">
                  <MemberChip email={c.createdBy} members={members} />
                  <Text size="xs" c="dimmed">
                    {c.createdAt.slice(0, 16).replace('T', ' ')}
                  </Text>
                </Group>
                <Text size="sm" className="breakable" style={{ whiteSpace: 'pre-wrap' }}>
                  {c.body}
                </Text>
              </Stack>
              {c.createdBy === me ? (
                <ActionIcon variant="subtle" color="red" aria-label="コメントを削除" onClick={() => handleDelete(c)}>
                  <Trash2 size={16} />
                </ActionIcon>
              ) : null}
            </Group>
          </Card>
        ))
      )}
      <Textarea placeholder="一言どうぞ" autosize minRows={2} value={body} onChange={(e) => setBody(e.currentTarget.value)} maxLength={2000} />
      <Button onClick={submit} loading={saving} disabled={!body.trim()} fullWidth>
        送信
      </Button>
    </Stack>
  )
}
```

`createdAt` は D1 の `datetime('now')`（UTC、`YYYY-MM-DD HH:MM:SS`）。表示は日時の先頭 16 文字で十分（Phase 3 で JST 変換をまとめる）。

- [ ] **Step 2: 4 つの詳細ページに組み込む**

各 loader を `Promise.all([...既存, listCommentsFor({ data: { targetType: 'visit'|'vendor'|'property'|'place', targetId: params.id } })])` に広げ、ページ末尾に `<CommentThread targetType=… targetId={…} comments={…} me={…} members={…} />`。

- [ ] **Step 3: 動作確認・検証・コミット**

Playwright: 見学記録の詳細でコメントを 2 件送る → 作成者チップに表示名と色 → 自分のコメントだけ削除ボタンがある（`.dev.vars` の `DEV_IDENTITY_EMAIL` を一時的に相手側に変えて再読込すると削除ボタンが相手側だけになる。戻す）。業者・物件・場所の詳細でも送れる。

```bash
npm run typecheck && npm run test:coverage && npm run format:check && npm run build
git add -A
git commit -m "feat(comments): 記録・候補・場所の詳細に二人のコメント

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: ホーム — 次の予定と「記録を書きませんか」

**Files:**
- Modify: `src/routes/index.tsx`
- Create: `src/components/home/UpcomingEvents.tsx` `src/components/home/PendingVisits.tsx`
- Modify: `src/routes/calendar.tsx`（`onRecord` を `navigate({ to: '/records', search: { tab: 'visits', fromEvent: e.id } })` に繋ぐ）

**Interfaces:**
- Consumes: `listHomeEvents()`（Task 2）、`EventItem`（Task 3）、`formatEventTime` `dateKey`

- [ ] **Step 1: コンポーネント**

`UpcomingEvents({ events })`: 見出し「次の予定」、無ければ「予定はありません」、あれば各 `Card`（`dateKey(startsAt)` `formatEventTime` `title` 場所名）を `Link to="/calendar" search={{ d: dateKey(startsAt), m: dateKey(startsAt).slice(0,7) }}` で包む。
`PendingVisits({ events })`: 見出し「記録を書きませんか」、各 `Card` に `dateKey` `title` 場所名と `Button size="compact-sm"` 「記録を書く」→ `Link to="/records" search={{ tab: 'visits', fromEvent: e.id }}`。0 件なら何も描かない（見出しも出さない）。

- [ ] **Step 2: `src/routes/index.tsx`**

```tsx
import { Stack } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'

import { PageShell } from '../components/PageShell'
import { PendingVisits } from '../components/home/PendingVisits'
import { UpcomingEvents } from '../components/home/UpcomingEvents'
import { listHomeEvents } from '../server/events'

export const Route = createFileRoute('/')({ component: Home, loader: () => listHomeEvents() })

function Home() {
  const { upcoming, pending } = Route.useLoaderData()
  return (
    <PageShell title="住まいログ" description="二人の家探しの記録">
      <Stack gap="lg">
        <PendingVisits events={pending} />
        <UpcomingEvents events={upcoming} />
      </Stack>
    </PageShell>
  )
}
```

（「最近の更新」フィードは Phase 3。）

- [ ] **Step 3: 動作確認・検証・コミット**

Playwright: ホームに Phase 1 の予定のうち未来のものが「次の予定」に、過去で記録の無い見学が「記録を書きませんか」に出る（件数のみ報告）→「記録を書く」→ 記録タブでフォームが予定の内容で開く → 保存 → ホームに戻るとその予定が消え、予定タブでは「記録あり」。

```bash
npm run typecheck && npm run test:coverage && npm run format:check && npm run build
git add -A
git commit -m "feat(home): 次の予定と「記録を書きませんか」

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 本番デプロイと配信の確認・ドキュメント

**Files:**
- Modify: `README.md`（「できること」に Phase 2 を追記、写真の縮小仕様と上限、バックアップに R2 の注意）`AGENTS.md`（`/api/photos*` はサーバールートであって資産ではない、と明記）

- [ ] **Step 1: マージ後に本番へ**（Workers Builds が接続済みなら push で走る。走らなければ `npm run deploy`）。`npx wrangler deployments list | tail -6` の最新 `Created` が push 時刻以降であること。
- [ ] **Step 2: 本番確認（本人のブラウザ、または `curl` で Access 越しは不可）**: 記録タブに投入済みの見学記録 3 件と写真サムネが出る／予定タブに 4 件／ホームに「記録を書きませんか」（過去の予定で記録が無いものがあれば）。レポートには件数のみ。
- [ ] **Step 3: `npm run db:export` を 1 回実行し Drive の `backups/sumai-log` へコピー**（Phase 2 で行が増えるため）。
- [ ] **Step 4: コミット・push**

```bash
git add README.md AGENTS.md
git commit -m "docs: Phase 2 の機能と写真の仕様を README/AGENTS に反映

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Phase 2 完了の確認

- `npm run format:check` `typecheck` `test:coverage`（lib 100%）`test:server` `test:scripts` `build` `check:pii` が green、CI green
- 本番で: 予定タブ（月・日別・追加/編集/削除）／記録タブ（一覧・詳細・写真の追加/閲覧/削除）／コメント／ホームの 2 セクション
- 投入済みの予定 4・見学記録 3・写真 4 が画面で見える
- 次: Phase 3（YouTube メモ・ホームのフィード・PWA・デザイン仕上げ）

---

### Task 10: 業者の SNS / 公式サイトをアイコンリンクで出す（追加要望・Task 8 の後、Task 9 の前に実行）

**Files:**
- Modify: `src/db/schema.ts`（`vendors.socialUrls` JSON 配列を追加）→ `npm run db:generate -- --name add_vendor_social_urls` → `drizzle/migrations/0002_*.sql`
- Create: `src/lib/social.ts` `src/lib/social.test.ts` `src/components/candidates/VendorLinks.tsx` `src/components/icons/BrandIcon.tsx`
- Modify: `src/server/candidates.ts`（`vendorInput.socialUrls`）`src/components/candidates/VendorForm.tsx`（SNS の URL 入力）`src/components/candidates/VendorCard.tsx`（アイコン行）`src/routes/candidates_.vendors.$id.tsx`（アイコン行）`scripts/lib/seed.mjs` `scripts/import-seed.mjs`（`socialUrls` を `social_urls` に書く）`scripts/lib/seed.test.mjs`

**Interfaces:**
- Produces（`src/lib/social.ts`）: `SOCIAL_PLATFORMS = ['instagram','x','youtube','facebook','tiktok','line','threads','note','other'] as const`／`detectPlatform(url: string): SocialPlatform`（ホスト名で判定: `instagram.com`→instagram、`x.com`/`twitter.com`→x、`youtube.com`/`youtu.be`→youtube、`facebook.com`/`fb.com`→facebook、`tiktok.com`→tiktok、`line.me`/`lin.ee`→line、`threads.net`→threads、`note.com`→note、それ以外→other；`www.` は無視；不正 URL→other）／`PLATFORM_LABEL: Record<SocialPlatform,string>`（Instagram / X / YouTube / Facebook / TikTok / LINE / Threads / note / リンク）／`normalizeSocialUrls(list: string[]): string[]`（trim・空除去・重複除去・`http(s)://` 以外は除外・最大 10 件）
- Produces（`BrandIcon({ platform, size? })`）: インライン SVG（simple-icons の path を使用。CC0。8 ブランド + `other` は lucide `Link`）。`aria-hidden`
- Produces（`VendorLinks({ vendor, size? })`）: `websiteUrl` があれば lucide `Globe` の `ActionIcon`（`aria-label="公式サイト"`）、`socialUrls` の各 URL を `BrandIcon` の `ActionIcon`（`aria-label={PLATFORM_LABEL}`）で並べる。`component="a" href target="_blank" rel="noopener noreferrer"`、`onClick={(e) => e.stopPropagation()}`。どちらも無ければ何も描かない

- [ ] **Step 1: `src/lib/social.test.ts` → `social.ts`（TDD）**

```ts
// social.test.ts
import { describe, expect, it } from 'vitest'
import { PLATFORM_LABEL, detectPlatform, normalizeSocialUrls } from './social'
describe('detectPlatform', () => {
  it('ホスト名で判定し www. と大文字を無視する', () => {
    expect(detectPlatform('https://www.instagram.com/example/')).toBe('instagram')
    expect(detectPlatform('https://x.com/Example_')).toBe('x')
    expect(detectPlatform('https://twitter.com/example')).toBe('x')
    expect(detectPlatform('https://www.youtube.com/@example')).toBe('youtube')
    expect(detectPlatform('https://youtu.be/abc')).toBe('youtube')
    expect(detectPlatform('https://www.facebook.com/example/')).toBe('facebook')
    expect(detectPlatform('https://www.tiktok.com/@example')).toBe('tiktok')
    expect(detectPlatform('https://lin.ee/abc')).toBe('line')
    expect(detectPlatform('https://www.threads.net/@example')).toBe('threads')
    expect(detectPlatform('https://note.com/example')).toBe('note')
    expect(detectPlatform('HTTPS://WWW.INSTAGRAM.COM/x')).toBe('instagram')
  })
  it('不明・不正は other', () => {
    expect(detectPlatform('https://example.com/')).toBe('other')
    expect(detectPlatform('not a url')).toBe('other')
    expect(PLATFORM_LABEL.other).toBe('リンク')
  })
})
describe('normalizeSocialUrls', () => {
  it('空白除去・空と非 http を除外・重複除去・10 件まで', () => {
    expect(normalizeSocialUrls([' https://x.com/a ', '', 'ftp://x', 'https://x.com/a', 'https://note.com/b'])).toEqual(['https://x.com/a', 'https://note.com/b'])
    expect(normalizeSocialUrls(Array.from({ length: 12 }, (_, i) => `https://example.com/${i}`))).toHaveLength(10)
  })
})
```

```ts
// social.ts
export const SOCIAL_PLATFORMS = ['instagram', 'x', 'youtube', 'facebook', 'tiktok', 'line', 'threads', 'note', 'other'] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]
export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  instagram: 'Instagram', x: 'X', youtube: 'YouTube', facebook: 'Facebook', tiktok: 'TikTok', line: 'LINE', threads: 'Threads', note: 'note', other: 'リンク',
}
const HOSTS: [RegExp, SocialPlatform][] = [
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(x|twitter)\.com$/, 'x'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(facebook|fb)\.com$/, 'facebook'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(line\.me|lin\.ee)$/, 'line'],
  [/(^|\.)threads\.net$/, 'threads'],
  [/(^|\.)note\.com$/, 'note'],
]
export function detectPlatform(url: string): SocialPlatform {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return 'other'
  }
  for (const [re, platform] of HOSTS) if (re.test(host)) return platform
  return 'other'
}
export function normalizeSocialUrls(list: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const raw of list) {
    const v = raw.trim()
    if (!/^https?:\/\//i.test(v)) continue
    if (!seen.has(v)) seen.add(v)
    if (seen.size >= 10) break
  }
  return [...seen]
}
```

- [ ] **Step 2: スキーマとマイグレーション**

`vendors` に `socialUrls: jsonList('social_urls')` を追加（`jsonList` は既存ヘルパ）。`npm run db:generate -- --name add_vendor_social_urls`、`npm run db:migrate:local`。生成 SQL は `ALTER TABLE vendors ADD social_urls text DEFAULT '[]' NOT NULL` 相当。

- [ ] **Step 3: server と seed**

`src/server/candidates.ts` `vendorInput` に `socialUrls: z.array(z.string().trim().max(500)).max(10).transform(normalizeSocialUrls)`（`normalizeSocialUrls` を lib から import）。`scripts/lib/seed.mjs` の vendors INSERT に `social_urls`（`JSON.stringify(v.socialUrls ?? [])`）を足し、テストに 1 件（`socialUrls` あり／なし）。`scripts/import-seed.mjs` は列が増えるだけ（変更不要なら不要と報告）。

- [ ] **Step 4: UI**

`BrandIcon.tsx`: `platform` ごとの `<svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden><path d="…"/></svg>`。path は simple-icons（https://simpleicons.org・CC0）の `instagram` `x` `youtube` `facebook` `tiktok` `line` `threads` `note` を使う（`node_modules` に無いので path 文字列を貼る。出典コメントを付ける）。`other` は lucide `Link`。

`VendorLinks.tsx`:
```tsx
import { ActionIcon, Group } from '@mantine/core'
import { Globe } from 'lucide-react'
import { PLATFORM_LABEL, detectPlatform } from '../../lib/social'
import { BrandIcon } from '../icons/BrandIcon'
export function VendorLinks({ websiteUrl, socialUrls, size = 'sm' }: { websiteUrl: string | null; socialUrls: string[]; size?: 'sm' | 'md' }) {
  if (!websiteUrl && socialUrls.length === 0) return null
  const px = size === 'sm' ? 16 : 20
  return (
    <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
      {websiteUrl ? (
        <ActionIcon component="a" href={websiteUrl} target="_blank" rel="noopener noreferrer" variant="subtle" size={size} aria-label="公式サイト">
          <Globe size={px} aria-hidden />
        </ActionIcon>
      ) : null}
      {socialUrls.map((url) => {
        const p = detectPlatform(url)
        return (
          <ActionIcon key={url} component="a" href={url} target="_blank" rel="noopener noreferrer" variant="subtle" size={size} aria-label={PLATFORM_LABEL[p]}>
            <BrandIcon platform={p} size={px} />
          </ActionIcon>
        )
      })}
    </Group>
  )
}
```

`VendorCard.tsx`: カード全体を `Link` で包む構造をやめ、`Card` に `onClick={() => navigate({ to: '/candidates/vendors/$id', params })}` と `style={{ cursor: 'pointer' }}` を付け、名前は `<Link><Text component="span" fw={700}>` にし、右下（坪単価の行の右）に `VendorLinks`（アンカーの入れ子を避けるため）。`role="link"` と `tabIndex={0}`・Enter で遷移も付ける（アクセシビリティ）。`candidates_.vendors.$id.tsx`: 見出し下のバッジ行に `VendorLinks size="md"`。既存の「公式」「参照 URL」の `Row` は残す。

`VendorForm.tsx`: 「SNS の URL」`Textarea`（1 行 1 URL、`autosize minRows={2}`、説明「Instagram / X / YouTube / Facebook / TikTok / LINE / Threads / note のプロフィール URL を 1 行に 1 つ」）。値は `socialUrls.join('\n')` ↔ 送信時 `split('\n')`。

- [ ] **Step 5: seed に SNS を入れて取り込む**（実データは `seed.local.json` のみ。計画には書かない）

コントローラが `seed.local.json` の各業者に `socialUrls` を足す。`npm run import:seed -- --local` → 候補タブで各業者カードにアイコンが並ぶ（件数のみ報告）→ `--remote`。

- [ ] **Step 6: 動作確認・検証・コミット**

Playwright（390×844）: 業者カードにアイコン（Globe＋SNS）が出て、アイコンをタップすると新しいタブで開き、カード本体のタップで詳細へ行く（両方）。詳細にも同じアイコン行。編集フォームで SNS URL を 1 行足して保存→アイコンが増える。不正な行（`abc`）は保存時に捨てられる。コンソール clean。

```bash
npm run db:generate -- --name ci_check   # 差分なしを確認（CI と同じ）
npm run typecheck && npm run test:coverage && npm run test:server && npm run test:scripts && npm run format:check && npm run build && npm run check:pii
git add -A
git commit -m "feat(candidates): 業者の公式サイトと SNS をアイコンリンクで表示"
```
