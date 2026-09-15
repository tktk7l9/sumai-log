import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../db/schema'
import { events, places, vendors, visits } from '../db/schema'
import {
  deleteEvent,
  deletePlaceCascade,
  deleteVendorCascade,
  getCachedGeocode,
  hasVisits,
  listEventsBetween,
  listEventsWithLinks,
  listPlacesWithLinks,
  listRecordedEventIds,
  putCachedGeocode,
  readHomeAreas,
  upsertEvent,
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

describe('events', () => {
  it('範囲検索は日付キーで比較し、終日と時刻ありが混ざっても開始順', async () => {
    await upsertEvent(
      db,
      {
        title: '見学A',
        kind: 'visit',
        startsAt: '2030-01-05T13:00:00+09:00',
        endsAt: null,
        allDay: false,
      },
      actor,
    )
    await upsertEvent(
      db,
      { title: '終日B', kind: 'other', startsAt: '2030-01-05', endsAt: null, allDay: true },
      actor,
    )
    await upsertEvent(
      db,
      { title: '来月', kind: 'visit', startsAt: '2030-02-01', endsAt: null, allDay: true },
      actor,
    )
    const rows = await listEventsBetween(db, '2030-01-01', '2030-01-31')
    expect(rows.map((r) => r.title)).toEqual(['終日B', '見学A'])
  })

  it('更新は createdBy を保ち、削除で見学記録の eventId が外れる', async () => {
    const id = await upsertEvent(
      db,
      { title: 'X', kind: 'visit', startsAt: '2030-01-05', endsAt: null, allDay: true },
      actor,
    )
    await upsertEvent(
      db,
      { id, title: 'Y', kind: 'meeting', startsAt: '2030-01-06', endsAt: null, allDay: true },
      'partner@example.com',
    )
    const [row] = await db.select().from(events).where(eq(events.id, id))
    expect(row.title).toBe('Y')
    expect(row.createdBy).toBe(actor)
    await db
      .insert(visits)
      .values({ id: crypto.randomUUID(), eventId: id, visitedOn: '2030-01-06', createdBy: actor })
    expect(await listRecordedEventIds(db)).toEqual(new Set([id]))
    await deleteEvent(db, id)
    const [visit] = await db.select().from(visits)
    expect(visit.eventId).toBeNull()
  })

  it('一覧に場所名・業者名が付く', async () => {
    const vendorId = await upsertVendor(
      db,
      { name: '甲工務店', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    const placeId = await upsertPlace(
      db,
      { name: 'テスト展示場', kind: 'showroom', vendorId },
      actor,
    )
    await upsertEvent(
      db,
      {
        title: 'E',
        kind: 'visit',
        startsAt: '2030-01-05',
        endsAt: null,
        allDay: true,
        placeId,
        vendorId,
      },
      actor,
    )
    const [row] = await listEventsWithLinks(db, '2030-01-01', '2030-01-31')
    expect([row.placeName, row.vendorName, row.propertyName]).toEqual([
      'テスト展示場',
      '甲工務店',
      null,
    ])
  })
})
