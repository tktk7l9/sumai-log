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

/** Deletes the row and returns it (used by the side that deletes the R2 keys). null if none */
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

/**
 * Reordering. photoIds is the photo ids of that visit record arranged in the new order.
 * "Are these really only photos that belong to that visit" is checked here (prevents
 * rewriting sort_order of photos of someone else's visit record just by knowing the UUID).
 * If even 1 does not belong, or the count does not match, does nothing and returns false.
 * The update is made 1 atomic unit with db.batch (same reason as replaceTags in tags.ts).
 */
export async function reorderPhotoRows(
  db: Db,
  visitId: string,
  photoIds: string[],
): Promise<boolean> {
  // An empty array is normally rejected by the caller's zod (min(1)), but exit early here
  // too so that an empty array is not passed to db.batch even if the repository is called alone
  if (photoIds.length === 0) return false
  const owned = new Set(
    (await db.select({ id: photos.id }).from(photos).where(eq(photos.visitId, visitId))).map(
      (r) => r.id,
    ),
  )
  if (photoIds.length !== owned.size || !photoIds.every((id) => owned.has(id))) return false

  const [first, ...rest] = photoIds.map((id, index) =>
    db.update(photos).set({ sortOrder: index }).where(eq(photos.id, id)),
  )
  await db.batch([first, ...rest])
  return true
}
