import { and, eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { comments, places, properties, vendors, visits, type NewPlace } from '../../db/schema'

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
    .set({ ...values, updatedAt: sql`(datetime('now'))` })
    .where(eq(places.id, id))
  return id
}

/** 場所を消す。見学記録が紐づいていたら消さない（記録の方が大事）。消すときはコメントも消す */
export async function deletePlaceCascade(
  db: Db,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: 'has_visits' }> {
  const [used] = await db
    .select({ n: sql<number>`count(*)` })
    .from(visits)
    .where(eq(visits.placeId, id))
  if ((used?.n ?? 0) > 0) return { ok: false, reason: 'has_visits' }
  await db.delete(comments).where(and(eq(comments.targetType, 'place'), eq(comments.targetId, id)))
  await db.delete(places).where(eq(places.id, id))
  return { ok: true }
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
