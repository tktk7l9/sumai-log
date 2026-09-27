import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { vendorNews, vendors } from '../../db/schema'
import { deleteVendorCascade, upsertVendor } from './candidates'
import { upsertEvent } from './events'
import {
  insertNewsIfNew,
  linkPlannedEvent,
  listNews,
  listNewsEventsBetween,
  listNewsSources,
  markNewsFetched,
  reparseNewsEventDates,
} from './news'
import { actor, db, reset } from './test-helpers'

beforeEach(reset)

async function makeVendor(name: string, overrides: Record<string, unknown> = {}) {
  return upsertVendor(db, { name, kind: 'koumuten', serviceAreas: [], ...overrides }, actor)
}

/**
 * For the ordering and period-search boundary tests, INSERT directly with even
 * first_seen_at stated explicitly. insertNewsIfNew auto-generates first_seen_at with
 * datetime('now') (not used, because multiple calls within the same second get the same
 * value and the ordering tests become unstable).
 */
async function insertRow(row: {
  id: string
  vendorId: string
  url: string
  title: string
  publishedOn: string
  firstSeenAt: string
  eventStart?: string | null
  eventEnd?: string | null
  eventKind?: string | null
}) {
  await db.insert(vendorNews).values({
    id: row.id,
    vendorId: row.vendorId,
    url: row.url,
    title: row.title,
    publishedOn: row.publishedOn,
    firstSeenAt: row.firstSeenAt,
    eventStart: row.eventStart ?? null,
    eventEnd: row.eventEnd ?? null,
    eventKind: row.eventKind ?? null,
  })
}

describe('insertNewsIfNew', () => {
  it('adds only new items and returns the number added', async () => {
    const vendorId = await makeVendor('テスト工務店')
    const first = await insertNewsIfNew(db, [
      {
        vendorId,
        url: 'https://news.example.com/1',
        title: 'お知らせ1',
        publishedOn: '2026-09-01',
      },
      {
        vendorId,
        url: 'https://news.example.com/2',
        title: 'お知らせ2',
        publishedOn: '2026-09-02',
      },
    ])
    expect(first).toBe(2)
    expect(await db.select().from(vendorNews)).toHaveLength(2)
  })

  it('does nothing when the url exists (updates to the title etc. are not tracked). Skipped items are not in the return value', async () => {
    const vendorId = await makeVendor('テスト工務店')
    await insertNewsIfNew(db, [
      {
        vendorId,
        url: 'https://news.example.com/dup',
        title: '最初のタイトル',
        publishedOn: '2026-09-02',
      },
    ])
    const second = await insertNewsIfNew(db, [
      {
        vendorId,
        url: 'https://news.example.com/dup',
        title: '更新後タイトル',
        publishedOn: '2026-09-02',
      },
      { vendorId, url: 'https://news.example.com/new', title: '新規', publishedOn: '2026-09-03' },
    ])
    expect(second).toBe(1)

    const rows = await db.select().from(vendorNews)
    expect(rows).toHaveLength(2)
    const dup = rows.find((r) => r.url === 'https://news.example.com/dup')
    expect(dup?.title).toBe('最初のタイトル')
  })

  it('does nothing and returns 0 for an empty array', async () => {
    expect(await insertNewsIfNew(db, [])).toBe(0)
  })

  it('all are added even when 25 items (a count that crosses the chunk boundaries of 10) are passed at once', async () => {
    const vendorId = await makeVendor('テスト工務店')
    const rows = Array.from({ length: 25 }, (_, i) => ({
      vendorId,
      url: `https://news.example.com/chunk-${i}`,
      title: `お知らせ${i}`,
      publishedOn: '2026-09-01',
    }))
    const added = await insertNewsIfNew(db, rows)
    expect(added).toBe(25)
    const stored = await db.select().from(vendorNews).where(eq(vendorNews.vendorId, vendorId))
    expect(stored).toHaveLength(25)
  })

  it('the url duplicate check works across chunks too (0 items the 2nd time)', async () => {
    const vendorId = await makeVendor('テスト工務店')
    const rows = Array.from({ length: 25 }, (_, i) => ({
      vendorId,
      url: `https://news.example.com/dedupe-${i}`,
      title: `お知らせ${i}`,
      publishedOn: '2026-09-01',
    }))
    await insertNewsIfNew(db, rows)
    const second = await insertNewsIfNew(db, rows)
    expect(second).toBe(0)
  })
})

describe('listNews', () => {
  it('ordered by published_on desc, first_seen_at desc, and carries the vendor name', async () => {
    const vendorA = await makeVendor('A工務店')
    const vendorB = await makeVendor('B工務店')

    await insertRow({
      id: 'a-old',
      vendorId: vendorA,
      url: 'https://news.example.com/a-old',
      title: 'A古い',
      publishedOn: '2026-09-01',
      firstSeenAt: '2026-09-01 00:00:00',
    })
    await insertRow({
      id: 'b-new',
      vendorId: vendorB,
      url: 'https://news.example.com/b-new',
      title: 'B新しい',
      publishedOn: '2026-09-05',
      firstSeenAt: '2026-09-05 00:00:00',
    })
    // 2 items with the same published_on and different first_seen_at (checks the tie-break)
    await insertRow({
      id: 'same-day-1',
      vendorId: vendorA,
      url: 'https://news.example.com/same-1',
      title: '同日1件目',
      publishedOn: '2026-09-03',
      firstSeenAt: '2026-09-03 09:00:00',
    })
    await insertRow({
      id: 'same-day-2',
      vendorId: vendorB,
      url: 'https://news.example.com/same-2',
      title: '同日2件目',
      publishedOn: '2026-09-03',
      firstSeenAt: '2026-09-03 10:00:00',
    })

    const rows = await listNews(db, { limit: 50, offset: 0 })
    expect(rows.map((r) => r.title)).toEqual(['B新しい', '同日2件目', '同日1件目', 'A古い'])
    expect(rows[0].vendorName).toBe('B工務店')
  })

  it('can filter by vendorId', async () => {
    const vendorA = await makeVendor('A工務店')
    const vendorB = await makeVendor('B工務店')
    await insertRow({
      id: 'a1',
      vendorId: vendorA,
      url: 'https://news.example.com/a1',
      title: 'Aのお知らせ',
      publishedOn: '2026-09-01',
      firstSeenAt: '2026-09-01 00:00:00',
    })
    await insertRow({
      id: 'b1',
      vendorId: vendorB,
      url: 'https://news.example.com/b1',
      title: 'Bのお知らせ',
      publishedOn: '2026-09-02',
      firstSeenAt: '2026-09-02 00:00:00',
    })

    const rows = await listNews(db, { vendorId: vendorA, limit: 50, offset: 0 })
    expect(rows.map((r) => r.title)).toEqual(['Aのお知らせ'])
  })

  it('can page with limit/offset', async () => {
    const vendorId = await makeVendor('テスト工務店')
    for (let i = 0; i < 5; i++) {
      await insertRow({
        id: `p${i}`,
        vendorId,
        url: `https://news.example.com/p${i}`,
        title: `お知らせ${i}`,
        publishedOn: `2026-09-0${i + 1}`,
        firstSeenAt: `2026-09-0${i + 1} 00:00:00`,
      })
    }
    const page = await listNews(db, { limit: 2, offset: 1 })
    // Newest first: news 4, news 3, news 2, news 1, news 0 -> offset 1, limit 2
    expect(page.map((r) => r.title)).toEqual(['お知らせ3', 'お知らせ2'])
  })

  it('can filter by from/to (published_on, bounds inclusive) (for the monthly agenda of /news)', async () => {
    const vendorId = await makeVendor('テスト工務店')
    await insertRow({
      id: 'before-month',
      vendorId,
      url: 'https://news.example.com/before-month',
      title: '月より前',
      publishedOn: '2026-08-31',
      firstSeenAt: '2026-08-31 00:00:00',
    })
    await insertRow({
      id: 'first-day',
      vendorId,
      url: 'https://news.example.com/first-day',
      title: '月初日（境界）',
      publishedOn: '2026-09-01',
      firstSeenAt: '2026-09-01 00:00:00',
    })
    await insertRow({
      id: 'mid-month',
      vendorId,
      url: 'https://news.example.com/mid-month',
      title: '月の中',
      publishedOn: '2026-09-15',
      firstSeenAt: '2026-09-15 00:00:00',
    })
    await insertRow({
      id: 'last-day',
      vendorId,
      url: 'https://news.example.com/last-day',
      title: '月末日（境界）',
      publishedOn: '2026-09-30',
      firstSeenAt: '2026-09-30 00:00:00',
    })
    await insertRow({
      id: 'after-month',
      vendorId,
      url: 'https://news.example.com/after-month',
      title: '月より後',
      publishedOn: '2026-10-01',
      firstSeenAt: '2026-10-01 00:00:00',
    })

    const rows = await listNews(db, { from: '2026-09-01', to: '2026-09-30', limit: 200, offset: 0 })
    expect(rows.map((r) => r.id)).toEqual(['last-day', 'mid-month', 'first-day'])
  })

  it('does not narrow the period, as before, when from/to are omitted', async () => {
    const vendorId = await makeVendor('テスト工務店')
    await insertRow({
      id: 'old',
      vendorId,
      url: 'https://news.example.com/old-unbounded',
      title: '古い',
      publishedOn: '2018-01-01',
      firstSeenAt: '2018-01-01 00:00:00',
    })
    const rows = await listNews(db, { limit: 200, offset: 0 })
    expect(rows.map((r) => r.id)).toContain('old')
  })

  it('vendorId and from/to can be given together (filters with AND)', async () => {
    const vendorA = await makeVendor('A工務店')
    const vendorB = await makeVendor('B工務店')
    await insertRow({
      id: 'a-in-month',
      vendorId: vendorA,
      url: 'https://news.example.com/a-in-month',
      title: 'Aの月内',
      publishedOn: '2026-09-10',
      firstSeenAt: '2026-09-10 00:00:00',
    })
    await insertRow({
      id: 'b-in-month',
      vendorId: vendorB,
      url: 'https://news.example.com/b-in-month',
      title: 'Bの月内',
      publishedOn: '2026-09-10',
      firstSeenAt: '2026-09-10 00:00:00',
    })

    const rows = await listNews(db, {
      vendorId: vendorA,
      from: '2026-09-01',
      to: '2026-09-30',
      limit: 200,
      offset: 0,
    })
    expect(rows.map((r) => r.id)).toEqual(['a-in-month'])
  })
})

describe('listNewsEventsBetween', () => {
  it('returns rows with event_start <= to and event_end >= from (bounds inclusive)', async () => {
    const vendorId = await makeVendor('テスト工務店')
    // Exactly on the boundary: event_start === to
    await insertRow({
      id: 'start-eq-to',
      vendorId,
      url: 'https://news.example.com/start-eq-to',
      title: '開始が範囲末日と一致',
      publishedOn: '2026-09-01',
      firstSeenAt: '2026-09-01 00:00:00',
      eventStart: '2026-09-10',
      eventEnd: '2026-09-10',
      eventKind: '見学会',
    })
    // Exactly on the boundary: event_end === from
    await insertRow({
      id: 'end-eq-from',
      vendorId,
      url: 'https://news.example.com/end-eq-from',
      title: '終了が範囲初日と一致',
      publishedOn: '2026-09-01',
      firstSeenAt: '2026-09-01 00:00:00',
      eventStart: '2026-09-01',
      eventEnd: '2026-09-01',
      eventKind: '見学会',
    })
    // Fits completely inside the range
    await insertRow({
      id: 'inside',
      vendorId,
      url: 'https://news.example.com/inside',
      title: '範囲内',
      publishedOn: '2026-09-01',
      firstSeenAt: '2026-09-01 00:00:00',
      eventStart: '2026-09-05',
      eventEnd: '2026-09-06',
      eventKind: '完成見学会',
    })
    // Out of range (before)
    await insertRow({
      id: 'before',
      vendorId,
      url: 'https://news.example.com/before',
      title: '範囲より前',
      publishedOn: '2026-08-01',
      firstSeenAt: '2026-08-01 00:00:00',
      eventStart: '2026-08-10',
      eventEnd: '2026-08-11',
      eventKind: '見学会',
    })
    // Out of range (after)
    await insertRow({
      id: 'after',
      vendorId,
      url: 'https://news.example.com/after',
      title: '範囲より後',
      publishedOn: '2026-10-01',
      firstSeenAt: '2026-10-01 00:00:00',
      eventStart: '2026-10-10',
      eventEnd: '2026-10-11',
      eventKind: '見学会',
    })
    // Vendor news not judged to be an event (event_start/end are null) is never included
    await insertNewsIfNew(db, [
      {
        vendorId,
        url: 'https://news.example.com/no-event',
        title: 'イベントではないお知らせ',
        publishedOn: '2026-09-05',
      },
    ])

    const rows = await listNewsEventsBetween(db, '2026-09-01', '2026-09-10')
    expect(rows.map((r) => r.id).sort()).toEqual(['end-eq-from', 'inside', 'start-eq-to'])
  })
})

describe('listNewsSources', () => {
  it('returns only vendors with newsUrl set', async () => {
    const withNews = await makeVendor('お知らせありの工務店', {
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    })
    await makeVendor('お知らせなしの工務店')

    const rows = await listNewsSources(db)
    expect(rows.map((r) => r.id)).toEqual([withNews])
    expect(rows[0]).toMatchObject({
      name: 'お知らせありの工務店',
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
      newsFetchedAt: null,
      newsFetchError: null,
    })
  })
})

describe('markNewsFetched', () => {
  it('on success advances news_fetched_at and sets news_fetch_error to null (updated_at is not touched)', async () => {
    const vendorId = await makeVendor('テスト工務店', {
      newsUrl: 'https://news.example.com/feed/',
      newsSource: 'rss',
    })
    const [before] = await db.select().from(vendors).where(eq(vendors.id, vendorId))

    await markNewsFetched(db, vendorId, '取得エラー: timeout')
    const [afterError] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(afterError.newsFetchedAt).not.toBeNull()
    expect(afterError.newsFetchError).toBe('取得エラー: timeout')
    expect(afterError.updatedAt).toBe(before.updatedAt)

    await markNewsFetched(db, vendorId, null)
    const [afterOk] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(afterOk.newsFetchError).toBeNull()
  })
})

describe('linkPlannedEvent', () => {
  it('sets planned_event_id', async () => {
    const vendorId = await makeVendor('テスト工務店')
    await insertNewsIfNew(db, [
      {
        vendorId,
        url: 'https://news.example.com/event-1',
        title: '見学会のお知らせ',
        publishedOn: '2026-09-01',
        eventStart: '2026-09-10',
        eventEnd: '2026-09-10',
        eventKind: '見学会',
      },
    ])
    const [news] = await db.select().from(vendorNews)
    const eventId = await upsertEvent(
      db,
      { title: '見学会のお知らせ', kind: 'visit', startsAt: '2026-09-10', allDay: true, vendorId },
      actor,
    )

    await linkPlannedEvent(db, news.id, eventId)

    const [after] = await db.select().from(vendorNews).where(eq(vendorNews.id, news.id))
    expect(after.plannedEventId).toBe(eventId)
  })
})

describe('reparseNewsEventDates', () => {
  it('re-parsing fixes the miss on "8/22.23" (the end stayed on day 1)', async () => {
    const vendorId = await makeVendor('テスト工務店')
    await insertRow({
      id: 'fix-me',
      vendorId,
      url: 'https://news.example.com/fix-me',
      title: '完成見学会 8/22.23開催のおしらせ',
      publishedOn: '2026-08-01',
      firstSeenAt: '2026-08-01 00:00:00',
      // The bug shape eventDate.ts actually produced before the fix (day 2 of the
      // enumeration was not picked up, so it stayed a single day)
      eventStart: '2026-08-22',
      eventEnd: '2026-08-22',
      eventKind: '完成見学会',
    })

    const result = await reparseNewsEventDates(db)
    expect(result).toEqual({ checked: 1, updated: 1 })

    const [after] = await db.select().from(vendorNews).where(eq(vendorNews.id, 'fix-me'))
    expect(after.eventStart).toBe('2026-08-22')
    expect(after.eventEnd).toBe('2026-08-23')
    expect(after.eventKind).toBe('完成見学会')
  })

  it('rows that are already correct count toward checked but not toward updated', async () => {
    const vendorId = await makeVendor('テスト工務店')
    await insertRow({
      id: 'already-correct',
      vendorId,
      url: 'https://news.example.com/already-correct',
      title: '見学会 9/12開催',
      publishedOn: '2026-08-20',
      firstSeenAt: '2026-08-20 00:00:00',
      eventStart: '2026-09-12',
      eventEnd: '2026-09-12',
      eventKind: '見学会',
    })
    await insertRow({
      id: 'no-event-both',
      vendorId,
      url: 'https://news.example.com/no-event-both',
      title: '工事の進捗のお知らせ（イベントではない）',
      publishedOn: '2026-08-20',
      firstSeenAt: '2026-08-20 00:00:00',
    })

    const result = await reparseNewsEventDates(db)
    expect(result).toEqual({ checked: 2, updated: 0 })
  })

  it('does not change planned_event_id (your own event linked by "行く" (Go))', async () => {
    const vendorId = await makeVendor('テスト工務店')
    await insertRow({
      id: 'with-planned',
      vendorId,
      url: 'https://news.example.com/with-planned',
      title: '完成見学会 8/22.23開催',
      publishedOn: '2026-08-01',
      firstSeenAt: '2026-08-01 00:00:00',
      eventStart: '2026-08-22',
      eventEnd: '2026-08-22',
      eventKind: '完成見学会',
    })
    const eventId = await upsertEvent(
      db,
      {
        title: '完成見学会 8/22.23開催',
        kind: 'visit',
        startsAt: '2026-08-22',
        allDay: true,
        vendorId,
      },
      actor,
    )
    await linkPlannedEvent(db, 'with-planned', eventId)

    const result = await reparseNewsEventDates(db)
    expect(result).toEqual({ checked: 1, updated: 1 })

    const [after] = await db.select().from(vendorNews).where(eq(vendorNews.id, 'with-planned'))
    expect(after.plannedEventId).toBe(eventId)
    expect(after.eventEnd).toBe('2026-08-23')
  })

  it('checked: 0, updated: 0 when there is no vendor_news', async () => {
    expect(await reparseNewsEventDates(db)).toEqual({ checked: 0, updated: 0 })
  })
})

describe('cascade on vendor deletion', () => {
  it('deleting a vendor deletes vendor_news too', async () => {
    const vendorId = await makeVendor('テスト工務店')
    await insertNewsIfNew(db, [
      {
        vendorId,
        url: 'https://news.example.com/cascade',
        title: '削除確認用',
        publishedOn: '2026-09-01',
      },
    ])
    expect(await db.select().from(vendorNews)).toHaveLength(1)

    await deleteVendorCascade(db, vendorId)

    expect(await db.select().from(vendorNews)).toHaveLength(0)
  })
})

describe('re-importing vendors (same shape as upsertStatement in scripts/lib/seed.mjs)', () => {
  /**
   * scripts/lib/seed.mjs used to use `INSERT OR REPLACE INTO vendors`, but SQLite's
   * REPLACE DELETEs the existing row and INSERTs it again on a primary key conflict, so
   * it dragged in `vendor_news.vendor_id` (ON DELETE CASCADE) and deleted all of
   * vendor_news (this happens with an operation that can really occur: re-running
   * `npm run import:seed`). Here, against a real D1, run the shape that seed.mjs's
   * upsertStatement actually generates (INSERT ... ON CONFLICT(id) DO UPDATE, updating
   * the columns other than id, created_by and created_at) as is, and check that it does
   * not go through DELETE = vendor_news is not deleted by cascade.
   */
  it('vendor_news remains even when vendors is re-imported with INSERT ... ON CONFLICT(id) DO UPDATE', async () => {
    const vendorId = crypto.randomUUID()
    const now = '2026-09-01 00:00:00'

    // Exactly the same column order that upsertStatement('vendors', {...}) in scripts/lib/seed.mjs passes
    const columns = [
      'id',
      'name',
      'kind',
      'hq',
      'representative',
      'service_areas',
      'affiliations',
      'ua_value',
      'c_value_published',
      'seismic_grade',
      'long_term_certified',
      'price_per_tsubo_min',
      'price_per_tsubo_max',
      'structure',
      'features',
      'status',
      'source_url',
      'website_url',
      'social_urls',
      'news_url',
      'news_source',
      'created_by',
      'created_at',
      'updated_at',
    ]
    const initialValues = [
      `'${vendorId}'`,
      "'再取り込みテスト業者'",
      "'koumuten'",
      'NULL',
      'NULL',
      "'[]'",
      "'[]'",
      'NULL',
      '0',
      'NULL',
      '0',
      'NULL',
      'NULL',
      'NULL',
      'NULL',
      "'interested'",
      'NULL',
      'NULL',
      "'[]'",
      'NULL',
      'NULL',
      `'${actor}'`,
      `'${now}'`,
      `'${now}'`,
    ]

    await env.DB.exec(
      `INSERT INTO vendors (${columns.join(', ')}) VALUES (${initialValues.join(', ')});`,
    )

    await insertNewsIfNew(db, [
      {
        vendorId,
        url: 'https://news.example.com/reimport-check',
        title: '再取り込み確認用のお知らせ',
        publishedOn: '2026-09-01',
      },
    ])
    expect(
      await db.select().from(vendorNews).where(eq(vendorNews.vendorId, vendorId)),
    ).toHaveLength(1)

    // "Re-import" in the same shape as upsertStatement: same id, only name changed, and
    // the columns other than id, created_by and created_at updated with ON CONFLICT DO UPDATE.
    const updateColumns = columns.filter((c) => !['id', 'created_by', 'created_at'].includes(c))
    const updatedValues = initialValues.map((v, i) =>
      columns[i] === 'name' ? "'再取り込みテスト業者（更新後）'" : v,
    )
    const setClause = updateColumns.map((c) => `${c} = excluded.${c}`).join(', ')
    await env.DB.exec(
      `INSERT INTO vendors (${columns.join(', ')}) VALUES (${updatedValues.join(', ')}) ON CONFLICT(id) DO UPDATE SET ${setClause};`,
    )

    // vendor_news has not been deleted by cascade
    const rows = await db.select().from(vendorNews).where(eq(vendorNews.vendorId, vendorId))
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('再取り込み確認用のお知らせ')

    // name is properly updated by the re-import (the upsert works)
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(vendor.name).toBe('再取り込みテスト業者（更新後）')
  })
})
