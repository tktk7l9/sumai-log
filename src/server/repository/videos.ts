import { and, desc, eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { comments, vendors, videos, type NewVideo, type Video } from '../../db/schema'
import { markRecordedVideoWatched, unmarkRecordedVideoWatched } from './channelVideos'
import { assertUpdated } from './stale'

type VideoInput = Omit<NewVideo, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & {
  id?: string
  expectedUpdatedAt?: string | null
}

type NewVideoValues = Omit<VideoInput, 'id' | 'expectedUpdatedAt'>

/**
 * A new memo. The creator is recorded here. A newly recorded video counts as watched on /works
 * too (markRecordedVideoWatched); `markedWatched` says whether that changed anything
 */
export async function insertVideo(
  db: Db,
  values: NewVideoValues,
  actorEmail: string,
): Promise<{ id: string; markedWatched: boolean }> {
  const id = crypto.randomUUID()
  await db.insert(videos).values({ ...values, id, createdBy: actorEmail })
  return { id, markedWatched: await markRecordedVideoWatched(db, values.videoId, actorEmail) }
}

/**
 * Creates when there is no id, updates when there is. An edit does not mark the video as
 * watched again, so a mark taken back on /works stays taken back
 */
export async function upsertVideo(db: Db, input: VideoInput, actorEmail: string): Promise<string> {
  const { id, expectedUpdatedAt, ...values } = input
  if (!id) return (await insertVideo(db, values, actorEmail)).id
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

/** The memo of a YouTube video, when one is written already (the oldest, if there are several) */
export async function findVideoByVideoId(
  db: Db,
  videoId: string,
): Promise<{ id: string; title: string } | null> {
  const [row] = await db
    .select({ id: videos.id, title: videos.title })
    .from(videos)
    .where(eq(videos.videoId, videoId))
    .orderBy(videos.createdAt)
    .limit(1)
  return row ?? null
}

/**
 * Takes a memo back right after it was added (「取り消す」): the memo, and the watched marks
 * when the add was what set them. Nothing happens when the memo is gone already
 */
export async function removeAddedVideo(db: Db, id: string, unmarkWatched: boolean): Promise<void> {
  const [row] = await db
    .select({ videoId: videos.videoId })
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1)
  if (!row) return
  await deleteVideoCascade(db, id)
  if (unmarkWatched) await unmarkRecordedVideoWatched(db, row.videoId)
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
