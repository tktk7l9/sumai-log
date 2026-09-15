import { and, asc, eq, sql } from 'drizzle-orm'

import type { Db } from '../db/client'
import {
  events,
  geocodeCache,
  photos,
  places,
  properties,
  settings,
  vendors,
  visits,
  type NewEvent,
  type NewPlace,
  type NewProperty,
  type NewVendor,
  type Photo,
} from '../db/schema'
import type { GeocodeHit } from '../lib/geocode'

/** 実データを壊しうる操作を db 引数で受ける形にし、実 D1 でテストできるようにする */

export async function readSetting(db: Db, key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
  return row?.value ?? null
}

export async function writeSetting(db: Db, key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: sql`(datetime('now'))` },
    })
}

export async function readHomeAreas(db: Db): Promise<string[]> {
  const raw = await readSetting(db, 'homeAreas')
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

type VendorInput = Omit<NewVendor, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & { id?: string }

/** id が無ければ作成、あれば更新。作成者は最初の保存時だけ記録する */
export async function upsertVendor(
  db: Db,
  input: VendorInput,
  actorEmail: string,
): Promise<string> {
  const { id, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(vendors).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  await db
    .update(vendors)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(vendors.id, id))
  return id
}

/** 業者を消す。場所・予定・見学・動画の vendorId は FK の SET NULL で外れる */
export async function deleteVendorCascade(db: Db, id: string): Promise<void> {
  await db.delete(vendors).where(eq(vendors.id, id))
}

type PropertyInput = Omit<NewProperty, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & {
  id?: string
}

export async function upsertProperty(
  db: Db,
  input: PropertyInput,
  actorEmail: string,
): Promise<string> {
  const { id, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(properties).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  await db
    .update(properties)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(properties.id, id))
  return id
}

export async function deletePropertyCascade(db: Db, id: string): Promise<void> {
  await db.delete(properties).where(eq(properties.id, id))
}

type PlaceInput = Omit<NewPlace, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & { id?: string }

export async function upsertPlace(db: Db, input: PlaceInput, actorEmail: string): Promise<string> {
  const { id, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(places).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  await db
    .update(places)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(places.id, id))
  return id
}

/** 場所を消す。見学記録が紐づいていたら消さない（記録の方が大事） */
export async function deletePlaceCascade(
  db: Db,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: 'has_visits' }> {
  const [used] = await db
    .select({ n: sql<number>`count(*)` })
    .from(visits)
    .where(eq(visits.placeId, id))
  if ((used?.n ?? 0) > 0) return { ok: false, reason: 'has_visits' }
  await db.delete(places).where(eq(places.id, id))
  return { ok: true }
}

/** その場所に見学記録が1件でもあるか。詳細ページのピンを塗る/塗らないの判定に使う */
export async function hasVisits(db: Db, placeId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(visits)
    .where(eq(visits.placeId, placeId))
  return Number(row?.n ?? 0) > 0
}

export async function getCachedGeocode(db: Db, query: string): Promise<GeocodeHit | null> {
  const [row] = await db.select().from(geocodeCache).where(eq(geocodeCache.query, query)).limit(1)
  return row ? { lat: row.lat, lng: row.lng, title: row.title } : null
}

export async function putCachedGeocode(db: Db, query: string, hit: GeocodeHit): Promise<void> {
  await db
    .insert(geocodeCache)
    .values({ query, lat: hit.lat, lng: hit.lng, title: hit.title })
    .onConflictDoUpdate({
      target: geocodeCache.query,
      set: { lat: hit.lat, lng: hit.lng, title: hit.title, fetchedAt: sql`(datetime('now'))` },
    })
}

/** 地図用: 場所に業者名・物件名・見学済みかを付ける */
export async function listPlacesWithLinks(db: Db) {
  const rows = await db
    .select({
      place: places,
      vendorName: vendors.name,
      propertyName: properties.name,
      visitCount: sql<number>`(select count(*) from visits v where v.place_id = ${places.id})`,
    })
    .from(places)
    .leftJoin(vendors, eq(places.vendorId, vendors.id))
    .leftJoin(properties, eq(places.propertyId, properties.id))
    .orderBy(places.name)
  return rows.map((r) => ({
    ...r.place,
    vendorName: r.vendorName ?? null,
    propertyName: r.propertyName ?? null,
    visited: Number(r.visitCount ?? 0) > 0,
  }))
}

export type PlaceWithLinks = Awaited<ReturnType<typeof listPlacesWithLinks>>[number]

export async function countPlacesByVendor(db: Db): Promise<Map<string, number>> {
  const rows = await db
    .select({ vendorId: places.vendorId, n: sql<number>`count(*)` })
    .from(places)
    .where(and(sql`${places.vendorId} is not null`))
    .groupBy(places.vendorId)
  return new Map(rows.map((r) => [r.vendorId as string, Number(r.n)]))
}

type EventInput = Omit<NewEvent, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & { id?: string }

export async function upsertEvent(db: Db, input: EventInput, actorEmail: string): Promise<string> {
  const { id, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(events).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  await db
    .update(events)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(events.id, id))
  return id
}

/** 予定を消す。見学記録の eventId は FK の SET NULL で外れる（記録は残る） */
export async function deleteEvent(db: Db, id: string): Promise<void> {
  await db.delete(events).where(eq(events.id, id))
}

export async function listEventsBetween(db: Db, fromKey: string, toKey: string) {
  return db
    .select()
    .from(events)
    .where(sql`substr(${events.startsAt}, 1, 10) between ${fromKey} and ${toKey}`)
    .orderBy(asc(events.startsAt))
}

export async function listAllEvents(db: Db) {
  return db.select().from(events).orderBy(asc(events.startsAt))
}

export async function listRecordedEventIds(db: Db): Promise<Set<string>> {
  const rows = await db
    .select({ eventId: visits.eventId })
    .from(visits)
    .where(sql`${visits.eventId} is not null`)
  return new Set(rows.map((r) => r.eventId as string))
}

export async function listEventsWithLinks(db: Db, fromKey: string, toKey: string) {
  const rows = await db
    .select({
      event: events,
      placeName: places.name,
      vendorName: vendors.name,
      propertyName: properties.name,
    })
    .from(events)
    .leftJoin(places, eq(events.placeId, places.id))
    .leftJoin(vendors, eq(events.vendorId, vendors.id))
    .leftJoin(properties, eq(events.propertyId, properties.id))
    .where(sql`substr(${events.startsAt}, 1, 10) between ${fromKey} and ${toKey}`)
    .orderBy(asc(events.startsAt))
  return rows.map((r) => ({
    ...r.event,
    placeName: r.placeName ?? null,
    vendorName: r.vendorName ?? null,
    propertyName: r.propertyName ?? null,
  }))
}
export type EventWithLinks = Awaited<ReturnType<typeof listEventsWithLinks>>[number]

export async function insertPhoto(
  db: Db,
  input: {
    id?: string
    visitId: string
    displayKey: string
    thumbKey: string
    width: number
    height: number
  },
  actorEmail: string,
): Promise<string> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(photos)
    .where(eq(photos.visitId, input.visitId))
  const { id: givenId, ...values } = input
  const id = givenId ?? crypto.randomUUID()
  await db
    .insert(photos)
    .values({ ...values, id, sortOrder: Number(n ?? 0), createdBy: actorEmail })
  return id
}

export async function listPhotos(db: Db, visitId: string): Promise<Photo[]> {
  return db
    .select()
    .from(photos)
    .where(eq(photos.visitId, visitId))
    .orderBy(asc(photos.sortOrder), asc(photos.createdAt))
}

export async function getPhoto(db: Db, id: string): Promise<Photo | null> {
  const [row] = await db.select().from(photos).where(eq(photos.id, id)).limit(1)
  return row ?? null
}

/** 行を消して返す（R2 のキーを消す側で使う）。無ければ null */
export async function deletePhotoRow(db: Db, id: string): Promise<Photo | null> {
  const row = await getPhoto(db, id)
  if (!row) return null
  await db.delete(photos).where(eq(photos.id, id))
  return row
}

export async function photoKeysOfVisit(db: Db, visitId: string): Promise<string[]> {
  const rows = await db
    .select({ d: photos.displayKey, t: photos.thumbKey })
    .from(photos)
    .where(eq(photos.visitId, visitId))
  return rows.flatMap((r) => [r.d, r.t])
}
