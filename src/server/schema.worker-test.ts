import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import * as schema from '../db/schema'
import { places, vendors } from '../db/schema'

const db = drizzle(env.DB, { schema })

describe('schema', () => {
  it('業者を登録し、施工エリアが JSON 配列で往復する', async () => {
    const id = crypto.randomUUID()
    await db.insert(vendors).values({
      id,
      name: '甲工務店',
      kind: 'koumuten',
      serviceAreas: ['テスト市', '架空町'],
      createdBy: 'owner@example.com',
    })
    const [row] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(row.serviceAreas).toEqual(['テスト市', '架空町'])
    expect(row.status).toBe('interested')
  })

  it('業者を消すと場所の vendorId は null になる（場所は残る）', async () => {
    const vendorId = crypto.randomUUID()
    const placeId = crypto.randomUUID()
    await db
      .insert(vendors)
      .values({ id: vendorId, name: '乙建設', createdBy: 'owner@example.com' })
    await db.insert(places).values({
      id: placeId,
      name: 'テスト展示場',
      kind: 'showroom',
      vendorId,
      createdBy: 'owner@example.com',
    })
    await db.delete(vendors).where(eq(vendors.id, vendorId))
    const [place] = await db.select().from(places).where(eq(places.id, placeId))
    expect(place).toBeDefined()
    expect(place.vendorId).toBeNull()
  })
})
