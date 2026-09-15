import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_TAGS } from '../../db/schema'
import { db, reset } from './test-helpers'
import { ensureTags, listTags, replaceTags, seedDefaultTags } from './tags'

beforeEach(reset)

describe('tags', () => {
  it('seedDefaultTags は空のときだけ既定タグを入れ、2 回呼んでも 11 件のまま', async () => {
    await seedDefaultTags(db)
    await seedDefaultTags(db)
    const rows = await listTags(db)
    expect(rows).toHaveLength(11)
    expect(rows.map((r) => r.name)).toEqual([...DEFAULT_TAGS])
  })

  it('既存タグがあれば seedDefaultTags は何もしない', async () => {
    await ensureTags(db, ['カスタム'])
    await seedDefaultTags(db)
    const rows = await listTags(db)
    expect(rows.map((r) => r.name)).toEqual(['カスタム'])
  })

  it('ensureTags は無い名前だけ末尾の sortOrder で足し、既にある名前は増やさない', async () => {
    await seedDefaultTags(db)
    await ensureTags(db, ['断熱', '新タグ'])
    let rows = await listTags(db)
    expect(rows).toHaveLength(12)
    expect(rows[11]).toMatchObject({ name: '新タグ', sortOrder: 11 })

    await ensureTags(db, ['新タグ'])
    rows = await listTags(db)
    expect(rows).toHaveLength(12)
  })

  it('ensureTags は同じ呼び出し内の重複名も 1 件だけ足す', async () => {
    await ensureTags(db, ['重複', '重複'])
    const rows = await listTags(db)
    expect(rows.map((r) => r.name)).toEqual(['重複'])
  })

  it('replaceTags は配列順で全置換する', async () => {
    await seedDefaultTags(db)
    await replaceTags(db, ['C', 'A', 'B'])
    const rows = await listTags(db)
    expect(rows.map((r) => [r.name, r.sortOrder])).toEqual([
      ['C', 0],
      ['A', 1],
      ['B', 2],
    ])
  })

  it('replaceTags は空配列で全消去できる', async () => {
    await seedDefaultTags(db)
    await replaceTags(db, [])
    expect(await listTags(db)).toEqual([])
  })
})
