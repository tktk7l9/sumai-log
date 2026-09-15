import { asc, eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { photos, type Photo } from '../../db/schema'

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
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${photos.sortOrder}), -1) + 1` })
    .from(photos)
    .where(eq(photos.visitId, input.visitId))
  const { id: givenId, ...values } = input
  const id = givenId ?? crypto.randomUUID()
  await db
    .insert(photos)
    .values({ ...values, id, sortOrder: Number(next ?? 0), createdBy: actorEmail })
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
