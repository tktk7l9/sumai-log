import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { measureD1, measureR2 } from './usage'
import { actor, db, reset } from './test-helpers'
import { vendors } from '../../db/schema'

beforeEach(reset)

describe('measureD1', () => {
  it('テーブルごとの行数と、データベースの大きさを返す', async () => {
    const empty = await measureD1(env.DB)
    expect(empty.rows.vendors).toBe(0)
    expect(empty.rows.visits).toBe(0)
    await db.insert(vendors).values([
      { id: 'v1', kind: 'koumuten', name: '甲', createdBy: actor },
      { id: 'v2', kind: 'hm', name: '乙', createdBy: actor },
    ])
    const usage = await measureD1(env.DB)
    expect(usage.rows.vendors).toBe(2)
    expect(usage.rows.photos).toBe(0)
    // miniflare の D1 も meta.size_after を返す（ページ単位なので 0 より大きい）
    expect(usage.bytes === null || usage.bytes > 0).toBe(true)
  })
})

describe('measureR2', () => {
  it('オブジェクト数と合計サイズを数える', async () => {
    const before = await measureR2(env.PHOTOS)
    await env.PHOTOS.put('usage-test/a', new Uint8Array(10))
    await env.PHOTOS.put('usage-test/b', new Uint8Array(30))
    const after = await measureR2(env.PHOTOS)
    expect(after.count - before.count).toBe(2)
    expect(after.bytes - before.bytes).toBe(40)
    expect(after.truncated).toBe(false)
    await env.PHOTOS.delete(['usage-test/a', 'usage-test/b'])
  })

  it('一覧が上限のページ数を超えたら truncated', async () => {
    const fake = {
      list: async () => ({ objects: [{ size: 1 }], truncated: true, cursor: 'c' }),
    } as unknown as R2Bucket
    const usage = await measureR2(fake)
    expect(usage.truncated).toBe(true)
    expect(usage.count).toBe(10)
  })
})
