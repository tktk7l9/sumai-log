import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { vendors, works, type NewWork } from '../../db/schema'
import { workUpsertSql } from '../../lib/works/sql'
import { EMPTY_FIELDS, type ParsedWork } from '../../lib/works/types'
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
    expect(rows[0]).not.toHaveProperty('watchedBy')
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
    await env.DB.exec(
      workUpsertSql({ ...parsed, youtubeVideoId: 'siteVideo02' }, crypto.randomUUID()),
    )
    const [row] = await db.select().from(works)
    expect(row?.youtubeVideoId).toBe('siteVideo02')
  })
})
