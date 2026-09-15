import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../db/schema'
import { places, vendors, visits } from '../db/schema'
import {
  deletePlaceCascade,
  deleteVendorCascade,
  getCachedGeocode,
  hasVisits,
  listPlacesWithLinks,
  putCachedGeocode,
  readHomeAreas,
  upsertPlace,
  upsertVendor,
  writeSetting,
} from './repository'

const db = drizzle(env.DB, { schema })
const actor = 'owner@example.com'

async function reset() {
  for (const t of [
    'photos',
    'visits',
    'events',
    'videos',
    'comments',
    'places',
    'vendors',
    'properties',
    'settings',
    'geocode_cache',
  ]) {
    await env.DB.exec(`DELETE FROM ${t}`)
  }
}
beforeEach(reset)

describe('settings', () => {
  it('homeAreas を JSON で往復し、壊れた値は空にする', async () => {
    expect(await readHomeAreas(db)).toEqual([])
    await writeSetting(db, 'homeAreas', JSON.stringify(['テスト市']))
    expect(await readHomeAreas(db)).toEqual(['テスト市'])
    await writeSetting(db, 'homeAreas', '{not json')
    expect(await readHomeAreas(db)).toEqual([])
  })
})

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
})

describe('places', () => {
  it('見学記録がある場所は消せない', async () => {
    const placeId = await upsertPlace(db, { name: 'テスト会場', kind: 'open_house' }, actor)
    await db
      .insert(visits)
      .values({ id: crypto.randomUUID(), placeId, visitedOn: '2030-01-01', createdBy: actor })
    expect(await deletePlaceCascade(db, placeId)).toEqual({ ok: false, reason: 'has_visits' })
    expect(await db.select().from(places).where(eq(places.id, placeId))).toHaveLength(1)
  })

  it('地図用の一覧に業者名と見学済みが付く', async () => {
    const vendorId = await upsertVendor(
      db,
      { name: '乙建設', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    const visitedId = await upsertPlace(
      db,
      { name: 'A', kind: 'model_house', vendorId, lat: 35, lng: 139 },
      actor,
    )
    await upsertPlace(db, { name: 'B', kind: 'showroom' }, actor)
    await db.insert(visits).values({
      id: crypto.randomUUID(),
      placeId: visitedId,
      visitedOn: '2030-01-01',
      createdBy: actor,
    })
    const rows = await listPlacesWithLinks(db)
    expect(rows.map((r) => [r.name, r.vendorName, r.visited])).toEqual([
      ['A', '乙建設', true],
      ['B', null, false],
    ])
  })

  it('hasVisits は見学記録の有無を返す', async () => {
    const placeId = await upsertPlace(db, { name: 'テスト展示場2', kind: 'showroom' }, actor)
    expect(await hasVisits(db, placeId)).toBe(false)
    await db
      .insert(visits)
      .values({ id: crypto.randomUUID(), placeId, visitedOn: '2030-01-01', createdBy: actor })
    expect(await hasVisits(db, placeId)).toBe(true)
  })
})

describe('geocode cache', () => {
  it('同じ文字列は上書きで 1 行', async () => {
    expect(await getCachedGeocode(db, 'テスト市')).toBeNull()
    await putCachedGeocode(db, 'テスト市', { lat: 35, lng: 139, title: 'テスト市' })
    await putCachedGeocode(db, 'テスト市', { lat: 36, lng: 140, title: null })
    expect(await getCachedGeocode(db, 'テスト市')).toEqual({ lat: 36, lng: 140, title: null })
  })
})
