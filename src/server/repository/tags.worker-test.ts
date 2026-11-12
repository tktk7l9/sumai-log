import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_TAGS } from '../../db/schema'
import { db, reset } from './test-helpers'
import { ensureTags, listTags, replaceTags, seedDefaultTags } from './tags'

beforeEach(reset)

describe('tags', () => {
  it('seedDefaultTags inserts the default tags only when empty, and stays at 11 rows even when called 2 times', async () => {
    await seedDefaultTags(db)
    await seedDefaultTags(db)
    const rows = await listTags(db)
    expect(rows).toHaveLength(11)
    expect(rows.map((r) => r.name)).toEqual([...DEFAULT_TAGS])
  })

  it('seedDefaultTags does nothing when tags already exist', async () => {
    await ensureTags(db, ['カスタム'])
    await seedDefaultTags(db)
    const rows = await listTags(db)
    expect(rows.map((r) => r.name)).toEqual(['カスタム'])
  })

  it('ensureTags adds only missing names with sortOrder at the end, and does not add names that already exist', async () => {
    await seedDefaultTags(db)
    await ensureTags(db, ['断熱', '新タグ'])
    let rows = await listTags(db)
    expect(rows).toHaveLength(12)
    expect(rows[11]).toMatchObject({ name: '新タグ', sortOrder: 11 })

    await ensureTags(db, ['新タグ'])
    rows = await listTags(db)
    expect(rows).toHaveLength(12)
  })

  it('ensureTags adds a name duplicated within the same call only 1 time', async () => {
    await ensureTags(db, ['重複', '重複'])
    const rows = await listTags(db)
    expect(rows.map((r) => r.name)).toEqual(['重複'])
  })

  it('replaceTags replaces everything in array order', async () => {
    await seedDefaultTags(db)
    await replaceTags(db, ['C', 'A', 'B'])
    const rows = await listTags(db)
    expect(rows.map((r) => [r.name, r.sortOrder])).toEqual([
      ['C', 0],
      ['A', 1],
      ['B', 2],
    ])
  })

  it('replaceTags stores as many tags as the editor allows (100), in order', async () => {
    await seedDefaultTags(db)
    const names = Array.from({ length: 100 }, (_, i) => `タグ${i}`)
    await replaceTags(db, names)
    const rows = await listTags(db)
    expect(rows.map((r) => r.name)).toEqual(names)
    expect(rows.map((r) => r.sortOrder)).toEqual(names.map((_, i) => i))
  })

  it('replaceTags keeps the old tags when a later part of the insert fails', async () => {
    await replaceTags(db, ['A', 'B'])
    const names = Array.from({ length: 100 }, (_, i) => `タグ${i}`)
    // NOT NULL on tags.name: the row fails in the last INSERT of the batch
    names[95] = null as unknown as string
    await expect(replaceTags(db, names)).rejects.toThrow(/NOT NULL/)
    expect((await listTags(db)).map((r) => r.name)).toEqual(['A', 'B'])
  })

  it('replaceTags can delete everything with an empty array', async () => {
    await seedDefaultTags(db)
    await replaceTags(db, [])
    expect(await listTags(db)).toEqual([])
  })
})
