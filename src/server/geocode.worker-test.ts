import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../db/schema'
import { geocodeAddress } from './geocode'

const db = drizzle(env.DB, { schema })
beforeEach(async () => {
  await env.DB.exec('DELETE FROM geocode_cache')
})

const fake =
  (body: unknown, ok = true) =>
  async () =>
    new Response(JSON.stringify(body), { status: ok ? 200 : 500 })

describe('geocodeAddress', () => {
  it('1 回目は API、2 回目はキャッシュ', async () => {
    const hit = [{ geometry: { coordinates: [139.5, 35.5] }, properties: { title: 'テスト市' } }]
    expect(await geocodeAddress(db, ' 仮想県 テスト市 ', fake(hit))).toEqual({
      lat: 35.5,
      lng: 139.5,
      title: 'テスト市',
      source: 'gsi',
    })
    expect(await geocodeAddress(db, '仮想県テスト市', fake([]))).toEqual({
      lat: 35.5,
      lng: 139.5,
      title: 'テスト市',
      source: 'cache',
    })
  })
  it('API が空・失敗・例外なら null で、キャッシュに残さない', async () => {
    expect(await geocodeAddress(db, '架空市', fake([]))).toBeNull()
    expect(await geocodeAddress(db, '架空市', fake([], false))).toBeNull()
    expect(
      await geocodeAddress(db, '架空市', async () => {
        throw new Error('down')
      }),
    ).toBeNull()
    expect(await geocodeAddress(db, '', fake([]))).toBeNull()
  })
})
