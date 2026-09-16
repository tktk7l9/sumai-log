import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { comments, places, vendors } from '../../db/schema'
import {
  deletePropertyCascade,
  deleteVendorCascade,
  upsertProperty,
  upsertVendor,
} from './candidates'
import { upsertPlace } from './places'
import { actor, db, reset } from './test-helpers'

beforeEach(reset)

describe('vendors', () => {
  it('作成→更新→削除。施工エリアは JSON 配列で往復し、削除で場所の vendorId が外れる', async () => {
    const id = await upsertVendor(
      db,
      { name: '甲工務店', kind: 'koumuten', serviceAreas: ['テスト市'] },
      actor,
    )
    let [row] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(row.serviceAreas).toEqual(['テスト市'])
    expect(row.createdBy).toBe(actor)

    await upsertVendor(
      db,
      { id, name: '甲工務店', kind: 'hm', serviceAreas: [] },
      'partner@example.com',
    )
    ;[row] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(row.kind).toBe('hm')
    expect(row.createdBy).toBe(actor)

    const placeId = await upsertPlace(
      db,
      { name: 'テスト展示場', kind: 'showroom', vendorId: id },
      actor,
    )
    await deleteVendorCascade(db, id)
    const [place] = await db.select().from(places).where(eq(places.id, placeId))
    expect(place.vendorId).toBeNull()
  })

  it('代表者名・加盟団体は JSON 配列で往復し、未指定なら null / 空配列になる', async () => {
    const id = await upsertVendor(
      db,
      {
        name: '乙工務店',
        kind: 'koumuten',
        serviceAreas: [],
        representative: '架空太郎',
        affiliations: ['iedukuri100', 'miratsugu'],
      },
      actor,
    )
    let [row] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(row.representative).toBe('架空太郎')
    expect(row.affiliations).toEqual(['iedukuri100', 'miratsugu'])

    const otherId = await upsertVendor(
      db,
      { name: '丙工務店', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    ;[row] = await db.select().from(vendors).where(eq(vendors.id, otherId))
    expect(row.representative).toBeNull()
    expect(row.affiliations).toEqual([])
  })
})

describe('properties', () => {
  it('作成→削除。紐づく場所の propertyId が外れ、物件へのコメントも消える', async () => {
    const id = await upsertProperty(
      db,
      { name: 'テストマンション', address: '東京都渋谷区' },
      actor,
    )

    const placeId = await upsertPlace(
      db,
      { name: 'テストギャラリー', kind: 'gallery', propertyId: id },
      actor,
    )
    const commentId = crypto.randomUUID()
    await db.insert(comments).values({
      id: commentId,
      targetType: 'property',
      targetId: id,
      body: '感想です',
      createdBy: actor,
    })

    await deletePropertyCascade(db, id)

    const [place] = await db.select().from(places).where(eq(places.id, placeId))
    expect(place.propertyId).toBeNull()
    const [comment] = await db.select().from(comments).where(eq(comments.id, commentId))
    expect(comment).toBeUndefined()
  })
})
