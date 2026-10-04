import { and, asc, count, eq, isNull, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'

import type { Db } from '../../db/client'
import { channelVideos, works, type ChannelVideo, type Work } from '../../db/schema'

/** watchedBy (an e-mail) stays in the table as a record; the screen does not use it */
export type ChannelVideoRow = Omit<ChannelVideo, 'watchedBy' | 'createdAt' | 'updatedAt'> & {
  /** The work whose tour video this is (works.youtube_video_id): the link to its page and its data */
  work: ChannelVideoWork | null
}

export type ChannelVideoWork = Pick<
  Work,
  | 'title'
  | 'sourceUrl'
  | 'category'
  | 'completedOn'
  | 'uaValue'
  | 'cValue'
  | 'family'
  | 'siteAreaTsubo'
  | 'floorAreaTsubo'
  | 'totalAreaTsubo'
  | 'layout'
  | 'points'
>

/** The work side of the join; the inner copy picks one work when two share a video */
const tourWork = alias(works, 'tour_work')

export type ChannelVideoFilter = {
  channelId?: string
  kind?: ChannelVideo['kind']
  unwatched?: boolean
  /** Part of the title */
  q?: string
  limit: number
}

export type ChannelSummary = {
  channelId: string
  channel: string
  total: number
  watched: number
}

function whereOf(filter: Omit<ChannelVideoFilter, 'limit'>): SQL | undefined {
  return and(
    filter.channelId ? eq(channelVideos.channelId, filter.channelId) : undefined,
    filter.kind ? eq(channelVideos.kind, filter.kind) : undefined,
    filter.unwatched ? isNull(channelVideos.watchedAt) : undefined,
    // instr, not LIKE: '%' and '_' in what was typed are plain characters
    filter.q ? sql`instr(lower(${channelVideos.title}), lower(${filter.q})) > 0` : undefined,
  )
}

/**
 * The first `limit` videos that match, channel by channel (vendors' channels first) and newest
 * first inside a channel, with the number of all matches for the "show more" button
 */
export async function listChannelVideos(
  db: Db,
  filter: ChannelVideoFilter,
): Promise<{ rows: ChannelVideoRow[]; matched: number }> {
  const where = whereOf(filter)
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: channelVideos.id,
        videoId: channelVideos.videoId,
        channelId: channelVideos.channelId,
        channel: channelVideos.channel,
        vendorId: channelVideos.vendorId,
        kind: channelVideos.kind,
        title: channelVideos.title,
        durationSec: channelVideos.durationSec,
        viewCount: channelVideos.viewCount,
        publishedAt: channelVideos.publishedAt,
        sortOrder: channelVideos.sortOrder,
        watchedAt: channelVideos.watchedAt,
        work: {
          title: tourWork.title,
          sourceUrl: tourWork.sourceUrl,
          category: tourWork.category,
          completedOn: tourWork.completedOn,
          uaValue: tourWork.uaValue,
          cValue: tourWork.cValue,
          family: tourWork.family,
          siteAreaTsubo: tourWork.siteAreaTsubo,
          floorAreaTsubo: tourWork.floorAreaTsubo,
          totalAreaTsubo: tourWork.totalAreaTsubo,
          layout: tourWork.layout,
          points: tourWork.points,
        },
      })
      .from(channelVideos)
      // Joined on the first work by sort order, so two works sharing a video do not repeat the row
      .leftJoin(
        tourWork,
        sql`${tourWork.id} = (SELECT ${works.id} FROM ${works} WHERE ${works.youtubeVideoId} = ${channelVideos.videoId} ORDER BY ${works.sortOrder} LIMIT 1)`,
      )
      .where(where)
      .orderBy(
        sql`${channelVideos.vendorId} IS NULL`,
        asc(channelVideos.channel),
        asc(channelVideos.sortOrder),
      )
      .limit(filter.limit),
    db.select({ n: count() }).from(channelVideos).where(where),
  ])
  return {
    rows,
    matched: total?.n ?? 0,
  }
}

/** Videos and watched videos per channel, in the same order as the list */
export async function channelSummaries(db: Db): Promise<ChannelSummary[]> {
  return db
    .select({
      channelId: channelVideos.channelId,
      channel: sql<string>`min(${channelVideos.channel})`,
      total: count(),
      watched: count(channelVideos.watchedAt),
    })
    .from(channelVideos)
    .groupBy(channelVideos.channelId)
    .orderBy(sql`min(${channelVideos.vendorId} IS NULL)`, sql`min(${channelVideos.channel})`)
}

/**
 * One watched flag shared by the two users, and shared with a work whose tour video is the same
 * video. Returns false when the video is gone
 */
export async function setChannelVideoWatched(
  db: Db,
  id: string,
  watched: boolean,
  actorEmail: string,
): Promise<boolean> {
  const patch = {
    watchedAt: watched ? new Date().toISOString() : null,
    watchedBy: watched ? actorEmail : null,
    updatedAt: sql`(datetime('now'))`,
  }
  const rows = await db
    .update(channelVideos)
    .set(patch)
    .where(eq(channelVideos.id, id))
    .returning({ videoId: channelVideos.videoId })
  const videoId = rows[0]?.videoId
  if (!videoId) return false
  await db.update(works).set(patch).where(eq(works.youtubeVideoId, videoId))
  return true
}

/**
 * A video that was just written in the video records (動画の記録) has been watched: mark the
 * same channel video and the work with that tour video, unless they already are. Called by
 * upsertVideo; the import does the same for videos recorded before they were imported
 */
export async function markRecordedVideoWatched(
  db: Db,
  videoId: string,
  actorEmail: string,
): Promise<void> {
  const patch = {
    watchedAt: new Date().toISOString(),
    watchedBy: actorEmail,
    updatedAt: sql`(datetime('now'))`,
  }
  await db
    .update(channelVideos)
    .set(patch)
    .where(and(eq(channelVideos.videoId, videoId), isNull(channelVideos.watchedAt)))
  await db
    .update(works)
    .set(patch)
    .where(and(eq(works.youtubeVideoId, videoId), isNull(works.watchedAt)))
}
