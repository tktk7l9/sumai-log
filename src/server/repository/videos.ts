import { and, desc, eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { comments, vendors, videos, type NewVideo, type Video } from '../../db/schema'
import { markRecordedVideoWatched } from './channelVideos'
import { assertUpdated } from './stale'

type VideoInput = Omit<NewVideo, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & {
  id?: string
  expectedUpdatedAt?: string | null
}

/**
 * Creates when there is no id, updates when there is. The creator is recorded only on the first
 * save. A newly recorded video counts as watched on /works too (markRecordedVideoWatched); an
 * edit does not mark again, so a mark taken back on /works stays taken back
 */
export async function upsertVideo(db: Db, input: VideoInput, actorEmail: string): Promise<string> {
  const { id, expectedUpdatedAt, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(videos).values({ ...values, id: newId, createdBy: actorEmail })
    await markRecordedVideoWatched(db, values.videoId, actorEmail)
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

/** Deletes a video. Comments are deleted */
export async function deleteVideoCascade(db: Db, id: string): Promise<void> {
  await db.delete(comments).where(and(eq(comments.targetType, 'video'), eq(comments.targetId, id)))
  await db.delete(videos).where(eq(videos.id, id))
}

/** List: newest watched date first (at the end if none) -> creation order, with the vendor name attached */
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
