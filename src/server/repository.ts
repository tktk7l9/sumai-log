import { and, eq, sql } from 'drizzle-orm'

import type { Db } from '../db/client'
import {
  geocodeCache,
  places,
  properties,
  settings,
  vendors,
  visits,
  type NewPlace,
  type NewProperty,
  type NewVendor,
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
