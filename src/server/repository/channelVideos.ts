import { and, asc, count, eq, isNull, sql, type SQL } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { channelVideos, works, type ChannelVideo } from '../../db/schema'

/** watchedBy (an e-mail) stays in the table as a record; the screen does not use it */
export type ChannelVideoRow = Omit<ChannelVideo, 'watchedBy' | 'createdAt' | 'updatedAt'>

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
        sortOrder: channelVideos.sortOrder,
        watchedAt: channelVideos.watchedAt,
      })
      .from(channelVideos)
      .where(where)
      .orderBy(
        sql`${channelVideos.vendorId} IS NULL`,
        asc(channelVideos.channel),
        asc(channelVideos.sortOrder),
      )
      .limit(filter.limit),
    db.select({ n: count() }).from(channelVideos).where(where),
  ])
  return { rows, matched: total?.n ?? 0 }
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
