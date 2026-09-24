import { and, desc, eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { comments, vendors, videos, type NewVideo, type Video } from '../../db/schema'
import { assertUpdated } from './stale'

type VideoInput = Omit<NewVideo, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & {
  id?: string
  expectedUpdatedAt?: string | null
}

/** id が無ければ作成、あれば更新。作成者は最初の保存時だけ記録する */
export async function upsertVideo(db: Db, input: VideoInput, actorEmail: string): Promise<string> {
  const { id, expectedUpdatedAt, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(videos).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  const rows = await db
    .update(videos)
    .set({ ...values, updatedAt: sql`(datetime('now'))` })
    .where(
      expectedUpdatedAt
        ? and(eq(videos.id, id), eq(videos.updatedAt, expectedUpdatedAt))
        : eq(videos.id, id),
    )
    .returning({ id: videos.id })
  assertUpdated(rows, expectedUpdatedAt)
  return id
}

/** 動画を消す。コメントは消す */
export async function deleteVideoCascade(db: Db, id: string): Promise<void> {
  await db.delete(comments).where(and(eq(comments.targetType, 'video'), eq(comments.targetId, id)))
  await db.delete(videos).where(eq(videos.id, id))
}

/** 一覧: 観た日の新しい順（無ければ末尾）→ 作成順で業者名を付ける */
export async function listVideosWithLinks(
  db: Db,
): Promise<(Video & { vendorName: string | null })[]> {
  const rows = await db
    .select({ video: videos, vendorName: vendors.name })
    .from(videos)
    .leftJoin(vendors, eq(videos.vendorId, vendors.id))
    .orderBy(desc(videos.watchedOn), desc(videos.createdAt))
  return rows.map((r) => ({ ...r.video, vendorName: r.vendorName ?? null }))
}

export async function getVideoDetail(
  db: Db,
  id: string,
): Promise<{ video: Video; vendor: { id: string; name: string } | null } | null> {
  const [video] = await db.select().from(videos).where(eq(videos.id, id)).limit(1)
  if (!video) return null
  const [vendor] = video.vendorId
    ? await db
        .select({ id: vendors.id, name: vendors.name })
        .from(vendors)
        .where(eq(vendors.id, video.vendorId))
        .limit(1)
    : []
  return { video, vendor: vendor ?? null }
}
