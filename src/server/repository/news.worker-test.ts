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
} from './news'
import { actor, db, reset } from './test-helpers'

beforeEach(reset)

async function makeVendor(name: string, overrides: Record<string, unknown> = {}) {
  return upsertVendor(db, { name, kind: 'koumuten', serviceAreas: [], ...overrides }, actor)
}

/**
 * 並び順・期間検索の境界テストのために first_seen_at まで明示して直接 INSERT する。
 * insertNewsIfNew は first_seen_at を datetime('now') で自動生成する（同一秒内の
 * 複数呼び出しで値が揃ってしまい、並びのテストが不安定になるため使わない）。
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
  it('新着だけ追加し、追加できた件数を返す', async () => {
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

  it('url が既存なら何もしない（タイトル等の更新は追わない）。スキップ分は戻り値に含めない', async () => {
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

  it('空配列なら何もせず 0 を返す', async () => {
    expect(await insertNewsIfNew(db, [])).toBe(0)
  })

  it('25件（10件ずつのチャンク境界をまたぐ件数）を一度に渡しても全件追加される', async () => {
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

  it('チャンクをまたいでも url の重複判定は効く（2回目は0件）', async () => {
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
  it('published_on desc, first_seen_at desc で並び、業者名が付く', async () => {
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
    // 同じ published_on で first_seen_at が異なる2件（タイブレークの確認）
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

  it('vendorId で絞り込める', async () => {
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

  it('limit/offset でページングできる', async () => {
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
    // 新しい順: お知らせ4, お知らせ3, お知らせ2, お知らせ1, お知らせ0 → offset 1, limit 2
    expect(page.map((r) => r.title)).toEqual(['お知らせ3', 'お知らせ2'])
  })

  it('from/to（published_on、境界含む）で絞り込める（/news の月ごとのアジェンダ用）', async () => {
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

  it('from/to を省略すれば従来どおり期間を絞らない', async () => {
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

  it('vendorId と from/to を同時に指定できる（AND で絞り込む）', async () => {
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
  it('event_start <= to かつ event_end >= from の行を返す（境界含む）', async () => {
    const vendorId = await makeVendor('テスト工務店')
    // ぴったり境界: event_start === to
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
    // ぴったり境界: event_end === from
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
    // 範囲の中に完全に収まる
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
    // 範囲外（前）
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
    // 範囲外（後）
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
    // イベント判定されていない（event_start/end が null）お知らせは絶対に含まれない
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
  it('newsUrl が設定されている業者だけを返す', async () => {
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
  it('成功時は news_fetched_at を進め news_fetch_error を null にする（updated_at は動かさない）', async () => {
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
  it('planned_event_id を設定する', async () => {
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

describe('vendor 削除時の cascade', () => {
  it('業者を削除すると vendor_news も消える', async () => {
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

describe('vendors の再取り込み（scripts/lib/seed.mjs の upsertStatement と同じ形）', () => {
  /**
   * scripts/lib/seed.mjs は以前 `INSERT OR REPLACE INTO vendors` を使っていたが、
   * SQLite の REPLACE は主キー衝突時に既存行を DELETE してから INSERT し直すため、
   * `vendor_news.vendor_id`（ON DELETE CASCADE）を巻き込んで vendor_news を
   * 全部消してしまっていた（`npm run import:seed` の再実行という、実際に
   * 起こりうる操作で発生する）。ここでは実 D1 に対して、seed.mjs の
   * upsertStatement が実際に生成する形（INSERT ... ON CONFLICT(id) DO UPDATE、
   * id・created_by・created_at 以外の列を更新）をそのまま流し、DELETE を経由
   * しない＝vendor_news が cascade で消えないことを確認する。
   */
  it('vendors を INSERT ... ON CONFLICT(id) DO UPDATE で再取り込みしても vendor_news は残る', async () => {
    const vendorId = crypto.randomUUID()
    const now = '2026-09-01 00:00:00'

    // scripts/lib/seed.mjs の upsertStatement('vendors', {...}) が渡す列とまったく同じ並び
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

    // upsertStatement と同じ形で「再取り込み」する: 同じ id、name だけ変えて、
    // id・created_by・created_at 以外の列を ON CONFLICT DO UPDATE で更新する。
    const updateColumns = columns.filter((c) => !['id', 'created_by', 'created_at'].includes(c))
    const updatedValues = initialValues.map((v, i) =>
      columns[i] === 'name' ? "'再取り込みテスト業者（更新後）'" : v,
    )
    const setClause = updateColumns.map((c) => `${c} = excluded.${c}`).join(', ')
    await env.DB.exec(
      `INSERT INTO vendors (${columns.join(', ')}) VALUES (${updatedValues.join(', ')}) ON CONFLICT(id) DO UPDATE SET ${setClause};`,
    )

    // vendor_news が cascade で消えていない
    const rows = await db.select().from(vendorNews).where(eq(vendorNews.vendorId, vendorId))
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('再取り込み確認用のお知らせ')

    // 再取り込みで name はちゃんと更新されている（upsert が効いている）
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId))
    expect(vendor.name).toBe('再取り込みテスト業者（更新後）')
  })
})
