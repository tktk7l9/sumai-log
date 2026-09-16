import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { sources, vendors, type NewSource } from '../../db/schema'
import { upsertVendor } from './candidates'
import { deleteSourceRow, listSourcesWithLinks, upsertSource } from './sources'
import { actor, db, reset } from './test-helpers'

beforeEach(reset)

type SourceSeed = Omit<NewSource, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & { id?: string }

const baseSource = (overrides: Partial<SourceSeed> = {}): SourceSeed => ({
  kind: 'youtube',
  name: 'テストチャンネル',
  url: 'https://www.youtube.com/@example-house',
  handle: '@example-house',
  channelId: null,
  genre: 'knowledge',
  description: null,
  avatarUrl: null,
  vendorId: null,
  affiliation: null,
  sortOrder: 0,
  ...overrides,
})

describe('sources', () => {
  it('新規作成は createdBy を記録し、更新では保たれる', async () => {
    const id = await upsertSource(db, baseSource({ name: 'A' }), actor)
    await upsertSource(db, baseSource({ id, name: 'B' }), 'partner@example.com')
    const [row] = await db.select().from(sources).where(eq(sources.id, id))
    expect(row.name).toBe('B')
    expect(row.createdBy).toBe(actor)
  })

  it('削除できる', async () => {
    const id = await upsertSource(db, baseSource(), actor)
    await deleteSourceRow(db, id)
    expect(await db.select().from(sources)).toHaveLength(0)
  })

  it('存在しない id を消しても例外にならない', async () => {
    await expect(deleteSourceRow(db, crypto.randomUUID())).resolves.toBeUndefined()
  })

  it('vendor を消すと sources.vendor_id は null になる（ON DELETE SET NULL）', async () => {
    const vendorId = await upsertVendor(
      db,
      { name: '乙建設', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    const id = await upsertSource(db, baseSource({ vendorId }), actor)
    await db.delete(vendors).where(eq(vendors.id, vendorId))
    const [row] = await db.select().from(sources).where(eq(sources.id, id))
    expect(row.vendorId).toBeNull()
  })

  it('一覧は sortOrder 昇順・name 昇順で並び、業者名が付く', async () => {
    const vendorId = await upsertVendor(
      db,
      { name: '甲工務店', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    await upsertSource(db, baseSource({ name: 'B', sortOrder: 1 }), actor)
    await upsertSource(
      db,
      baseSource({ name: 'A', url: 'https://www.youtube.com/@a', sortOrder: 1 }),
      actor,
    )
    await upsertSource(
      db,
      baseSource({ name: 'C', url: 'https://www.youtube.com/@c', sortOrder: 0, vendorId }),
      actor,
    )
    const rows = await listSourcesWithLinks(db)
    expect(rows.map((r) => [r.name, r.vendorName])).toEqual([
      ['C', '甲工務店'],
      ['A', null],
      ['B', null],
    ])
  })
})
