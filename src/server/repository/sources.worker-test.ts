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
  it('新規作成は createdBy を記録し、更新では保たれる', async () => {
    const id = await upsertSource(db, baseSource({ name: 'A' }), actor)
    await upsertSource(db, baseSource({ id, name: 'B' }), 'partner@example.com')
    const [row] = await db.select().from(sources).where(eq(sources.id, id))
    expect(row.name).toBe('B')
    expect(row.createdBy).toBe(actor)
  })

  it('削除できる（消した行を返す）', async () => {
    const id = await upsertSource(db, baseSource({ name: 'テスト' }), actor)
    const deleted = await deleteSourceRow(db, id)
    expect(deleted?.name).toBe('テスト')
    expect(await db.select().from(sources)).toHaveLength(0)
  })

  it('存在しない id を消しても例外にならず null を返す', async () => {
    await expect(deleteSourceRow(db, crypto.randomUUID())).resolves.toBeNull()
  })

  it('更新で対象の id が既に無ければ SOURCE_NOT_FOUND_ERROR を投げる（黙って成功しない）', async () => {
    const missingId = crypto.randomUUID()
    await expect(
      upsertSource(db, baseSource({ id: missingId, name: 'ゴースト' }), actor),
    ).rejects.toThrow(SOURCE_NOT_FOUND_ERROR)
    expect(await db.select().from(sources)).toHaveLength(0)
  })

  it('同じ url で新規作成すると DUPLICATE_URL_ERROR を投げる（別 id では作られない）', async () => {
    await upsertSource(db, baseSource({ name: 'A' }), actor)
    await expect(
      upsertSource(db, baseSource({ name: 'B' }), actor), // url は baseSource の既定値のまま重複
    ).rejects.toThrow(DUPLICATE_URL_ERROR)
    const rows = await db.select().from(sources)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('A')
  })

  it('既存行の url を別の行と同じ url に更新すると DUPLICATE_URL_ERROR を投げる（更新は反映されない）', async () => {
    await upsertSource(db, baseSource({ name: 'A' }), actor)
    const idB = await upsertSource(
      db,
      baseSource({ name: 'B', url: 'https://www.youtube.com/@b' }),
      actor,
    )
    await expect(
      upsertSource(db, baseSource({ id: idB, name: 'B改' }), actor), // url を A と同じに戻す
    ).rejects.toThrow(DUPLICATE_URL_ERROR)
    const [rowB] = await db.select().from(sources).where(eq(sources.id, idB))
    expect(rowB.name).toBe('B') // 更新前のまま
    expect(rowB.url).toBe('https://www.youtube.com/@b')
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
