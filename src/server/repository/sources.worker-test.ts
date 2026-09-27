import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { sources, vendors, type NewSource } from '../../db/schema'
import { DUPLICATE_URL_ERROR } from '../../lib/sources'
import { upsertVendor } from './candidates'
import {
  deleteSourceRow,
  listSourcesWithLinks,
  SOURCE_NOT_FOUND_ERROR,
  upsertSource,
} from './sources'
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
  it('create records createdBy, and update keeps it', async () => {
    const id = await upsertSource(db, baseSource({ name: 'A' }), actor)
    await upsertSource(db, baseSource({ id, name: 'B' }), 'partner@example.com')
    const [row] = await db.select().from(sources).where(eq(sources.id, id))
    expect(row.name).toBe('B')
    expect(row.createdBy).toBe(actor)
  })

  it('can delete (returns the deleted row)', async () => {
    const id = await upsertSource(db, baseSource({ name: 'テスト' }), actor)
    const deleted = await deleteSourceRow(db, id)
    expect(deleted?.name).toBe('テスト')
    expect(await db.select().from(sources)).toHaveLength(0)
  })

  it('deleting a non-existent id does not throw and returns null', async () => {
    await expect(deleteSourceRow(db, crypto.randomUUID())).resolves.toBeNull()
  })

  it('throws SOURCE_NOT_FOUND_ERROR when the target id is already gone on update (does not silently succeed)', async () => {
    const missingId = crypto.randomUUID()
    await expect(
      upsertSource(db, baseSource({ id: missingId, name: 'ゴースト' }), actor),
    ).rejects.toThrow(SOURCE_NOT_FOUND_ERROR)
    expect(await db.select().from(sources)).toHaveLength(0)
  })

  it('throws DUPLICATE_URL_ERROR when creating with the same url (not created under another id)', async () => {
    await upsertSource(db, baseSource({ name: 'A' }), actor)
    await expect(
      upsertSource(db, baseSource({ name: 'B' }), actor), // url stays the baseSource default, so it duplicates
    ).rejects.toThrow(DUPLICATE_URL_ERROR)
    const rows = await db.select().from(sources)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('A')
  })

  it('throws DUPLICATE_URL_ERROR when updating the url of an existing row to the same url as another row (the update is not applied)', async () => {
    await upsertSource(db, baseSource({ name: 'A' }), actor)
    const idB = await upsertSource(
      db,
      baseSource({ name: 'B', url: 'https://www.youtube.com/@b' }),
      actor,
    )
    await expect(
      upsertSource(db, baseSource({ id: idB, name: 'B改' }), actor), // put url back to the same as A
    ).rejects.toThrow(DUPLICATE_URL_ERROR)
    const [rowB] = await db.select().from(sources).where(eq(sources.id, idB))
    expect(rowB.name).toBe('B') // unchanged from before the update
    expect(rowB.url).toBe('https://www.youtube.com/@b')
  })

  it('deleting a vendor sets sources.vendor_id to null (ON DELETE SET NULL)', async () => {
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

  it('the list is ordered by sortOrder ascending, name ascending, and carries the vendor name', async () => {
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
