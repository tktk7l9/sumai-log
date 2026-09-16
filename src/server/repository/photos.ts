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

/**
 * 並び替え。photoIds はその見学記録の写真 id を新しい順で並べたもの。
 * 「本当にその visit に属する写真だけか」をここで確認する（UUID を知っていれば
 * 他人の見学記録の写真の sort_order を書き換えられてしまうのを防ぐ）。
 * 1 件でも属さない・件数が合わなければ何もせず false を返す。
 * 更新は db.batch で 1 つのアトミックな単位にする（tags.ts の replaceTags と同じ理由）。
 */
export async function reorderPhotoRows(
  db: Db,
  visitId: string,
  photoIds: string[],
): Promise<boolean> {
  // 空配列は呼び出し側の zod（min(1)）で通常は弾かれるが、repository 単体で
  // 呼ばれても db.batch に空配列を渡さないようここでも早く抜ける
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
