import { and, desc, eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import {
  comments,
  events,
  places,
  properties,
  vendors,
  visits,
  type NewVisit,
} from '../../db/schema'
import { listPhotos, photoKeysOfVisit } from './photos'
import { assertUpdated } from './stale'

/** その場所に見学記録が1件でもあるか。詳細ページのピンを塗る/塗らないの判定に使う */
export async function hasVisits(db: Db, placeId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(visits)
    .where(eq(visits.placeId, placeId))
  return Number(row?.n ?? 0) > 0
}

export async function listRecordedEventIds(db: Db): Promise<Set<string>> {
  const rows = await db
    .select({ eventId: visits.eventId })
    .from(visits)
    .where(sql`${visits.eventId} is not null`)
  return new Set(rows.map((r) => r.eventId as string))
}

type VisitInput = Omit<NewVisit, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & {
  id?: string
  expectedUpdatedAt?: string | null
}

export async function upsertVisit(db: Db, input: VisitInput, actorEmail: string): Promise<string> {
  const { id, expectedUpdatedAt, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(visits).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  const rows = await db
    .update(visits)
    .set({ ...values, updatedAt: sql`(datetime('now'))` })
    .where(
      expectedUpdatedAt
        ? and(eq(visits.id, id), eq(visits.updatedAt, expectedUpdatedAt))
        : eq(visits.id, id),
    )
    .returning({ id: visits.id })
  assertUpdated(rows, expectedUpdatedAt)
  return id
}

/**
 * 見学記録の「次にやること」だけを書き換える（詳細ページのチェックリストから）。開いた時点の
 * 更新日時と違えば StaleWriteError。書き換えたあとの更新日時を返す（続けて押したときの基準にする）
 */
export async function setVisitNextActions(
  db: Db,
  id: string,
  nextActions: string | null,
  expectedUpdatedAt: string,
): Promise<string> {
  const rows = await db
    .update(visits)
    .set({ nextActions, updatedAt: sql`(datetime('now'))` })
    .where(and(eq(visits.id, id), eq(visits.updatedAt, expectedUpdatedAt)))
    .returning({ updatedAt: visits.updatedAt })
  assertUpdated(rows, expectedUpdatedAt)
  return rows[0]!.updatedAt
}

/** 見学記録を消す。写真行は FK cascade。コメントは消す。R2 のキーを返すので呼び側で消す */
export async function deleteVisitCascade(db: Db, id: string): Promise<string[]> {
  const keys = await photoKeysOfVisit(db, id)
  await db.delete(comments).where(and(eq(comments.targetType, 'visit'), eq(comments.targetId, id)))
  await db.delete(visits).where(eq(visits.id, id))
  return keys
}

export async function listVisitsWithLinks(db: Db) {
  const rows = await db
    .select({
      visit: visits,
      placeName: places.name,
      vendorName: vendors.name,
      propertyName: properties.name,
      photoCount: sql<number>`(select count(*) from photos p where p.visit_id = ${visits.id})`,
      firstThumbKey: sql<
        string | null
      >`(select p.thumb_key from photos p where p.visit_id = ${visits.id} order by p.sort_order asc, p.created_at asc limit 1)`,
    })
    .from(visits)
    .leftJoin(places, eq(visits.placeId, places.id))
    .leftJoin(vendors, eq(visits.vendorId, vendors.id))
    .leftJoin(properties, eq(visits.propertyId, properties.id))
    .orderBy(desc(visits.visitedOn), desc(visits.createdAt))
  return rows.map((r) => ({
    ...r.visit,
    placeName: r.placeName ?? null,
    vendorName: r.vendorName ?? null,
    propertyName: r.propertyName ?? null,
    photoCount: Number(r.photoCount ?? 0),
    firstThumbKey: r.firstThumbKey ?? null,
  }))
}
export type VisitWithLinks = Awaited<ReturnType<typeof listVisitsWithLinks>>[number]

export async function getVisitDetail(db: Db, id: string) {
  const [visit] = await db.select().from(visits).where(eq(visits.id, id)).limit(1)
  if (!visit) return null
  const [place] = visit.placeId
    ? await db.select().from(places).where(eq(places.id, visit.placeId)).limit(1)
    : []
  const [vendor] = visit.vendorId
    ? await db.select().from(vendors).where(eq(vendors.id, visit.vendorId)).limit(1)
    : []
  const [property] = visit.propertyId
    ? await db.select().from(properties).where(eq(properties.id, visit.propertyId)).limit(1)
    : []
  const [event] = visit.eventId
    ? await db.select().from(events).where(eq(events.id, visit.eventId)).limit(1)
    : []
  const photoRows = await listPhotos(db, id)
  return {
    visit,
    place: place ?? null,
    vendor: vendor ?? null,
    property: property ?? null,
    event: event ?? null,
    photos: photoRows,
  }
}
export type VisitDetail = NonNullable<Awaited<ReturnType<typeof getVisitDetail>>>
