/**
 * The daily refresh of the channel videos (Cron, src/server.ts). The channels are the ones the
 * yt-dlp import already put in channel_videos (which channels to read is real data and stays out
 * of the repository), and each is read through the YouTube Data API: the newest 50 of every kind.
 * New videos go on top of their channel, existing ones get the current title, length and views,
 * and works still without a video are linked by name as in the import. Each channel is written
 * in batches (a few round trips to D1 instead of one per video).
 *
 * About 25 quota units a day for 6 channels (the free quota is 10,000). Plain functions so that
 * channelVideosFetcher.worker-test.ts can call them with a fake fetch.
 */
import { eq, inArray, isNotNull, sql } from 'drizzle-orm'

import type { Db } from '../db/client'
import { channelVideos, videos, works, type ChannelVideo } from '../db/schema'
import {
  RECORD_WATCHED_AT,
  VIDEOS_LIST_BATCH,
  type ChannelVideoKind,
} from '../lib/channelVideos/import'
import { matchWorksToVideos, workVideoLinkSql } from '../lib/channelVideos/match'
import {
  API_KINDS,
  kindPlaylistId,
  parsePlaylistItems,
  parseVideoDetails,
  playlistItemsUrl,
  videoDetailsUrl,
  type PlaylistVideo,
  type VideoDetails,
} from '../lib/channelVideos/youtubeApi'

const FETCH_TIMEOUT_MS = 10_000

export type ChannelRefreshResult = {
  channel: string
  added: number
  updated: number
  /** null when every call succeeded */
  error: string | null
}

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  // A channel without live streams (or shorts) has no such playlist
  if (res.status === 404) return null
  // The URL carries the key, so only the status goes into the message
  if (!res.ok) throw new Error(`YouTube API ${res.status}`)
  return res.json()
}

type Fetched = PlaylistVideo & { kind: ChannelVideoKind }

/** The newest videos of one channel over the kinds; a video in two playlists is kept once */
async function fetchChannel(
  channelId: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<{ list: Fetched[]; details: Record<string, VideoDetails> }> {
  const seen = new Set<string>()
  const list: Fetched[] = []
  for (const kind of API_KINDS) {
    const items = parsePlaylistItems(
      await getJson(playlistItemsUrl(kindPlaylistId(channelId, kind), apiKey), fetchImpl),
    )
    for (const item of items) {
      if (seen.has(item.videoId)) continue
      seen.add(item.videoId)
      list.push({ ...item, kind })
    }
  }
  const details: Record<string, VideoDetails> = {}
  for (let i = 0; i < list.length; i += VIDEOS_LIST_BATCH) {
    const ids = list.slice(i, i + VIDEOS_LIST_BATCH).map((v) => v.videoId)
    Object.assign(
      details,
      parseVideoDetails(await getJson(videoDetailsUrl(ids, apiKey), fetchImpl)),
    )
  }
  return { list, details }
}

/**
 * D1 refuses a statement with more than 100 bound parameters. One channel gives up to 150 ids
 * (50 per kind), and a lookup naming all of them failed every morning for the largest channel
 * (2026-11), so the ids are looked up this many at a time.
 */
const LOOKUP_CHUNK = 90

/** Statements per db.batch: one round trip to D1 for all of them instead of one per video */
const WRITE_BATCH = 50

/**
 * Writes one channel. A new video starts as watched when the same video is a watched work's tour
 * video or is in the video records, as in channelVideoUpsertSql; the watched flag of an existing
 * one is never touched, nor its place in the list. An existing video is written only when the
 * API gave something else than what the row has (most mornings: the views).
 */
async function saveChannel(
  db: Db,
  channel: { channelId: string; channel: string; vendorId: string | null },
  { list, details }: Awaited<ReturnType<typeof fetchChannel>>,
): Promise<{ added: number; updated: number }> {
  if (list.length === 0) return { added: 0, updated: 0 }
  const existing = new Map<
    string,
    Pick<ChannelVideo, 'title' | 'durationSec' | 'viewCount' | 'publishedAt'>
  >()
  for (let i = 0; i < list.length; i += LOOKUP_CHUNK) {
    const rows = await db
      .select({
        videoId: channelVideos.videoId,
        title: channelVideos.title,
        durationSec: channelVideos.durationSec,
        viewCount: channelVideos.viewCount,
        publishedAt: channelVideos.publishedAt,
      })
      .from(channelVideos)
      .where(
        inArray(
          channelVideos.videoId,
          list.slice(i, i + LOOKUP_CHUNK).map((v) => v.videoId),
        ),
      )
    for (const row of rows) existing.set(row.videoId, row)
  }
  // Oldest first, each one above the current top, so the newest ends up first
  const fresh = list
    .filter((v) => !existing.has(v.videoId))
    .sort((a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''))
  const inserts = fresh.map((video) => {
    const fromWork = (column: typeof works.watchedAt | typeof works.watchedBy) =>
      sql`(SELECT ${column} FROM ${works} WHERE ${works.youtubeVideoId} = ${video.videoId} AND ${works.watchedAt} IS NOT NULL LIMIT 1)`
    const fromRecord = (expression: string) =>
      sql`(SELECT ${sql.raw(expression)} FROM ${videos} WHERE ${videos.videoId} = ${video.videoId} ORDER BY ${videos.createdAt} LIMIT 1)`
    return db
      .insert(channelVideos)
      .values({
        id: crypto.randomUUID(),
        videoId: video.videoId,
        channelId: channel.channelId,
        channel: channel.channel,
        vendorId: channel.vendorId,
        kind: video.kind,
        title: video.title,
        durationSec: details[video.videoId]?.durationSec ?? null,
        viewCount: details[video.videoId]?.viewCount ?? null,
        publishedAt: video.publishedAt,
        sortOrder: sql`(SELECT COALESCE(MIN(${channelVideos.sortOrder}), 0) - 1 FROM ${channelVideos} WHERE ${channelVideos.channelId} = ${channel.channelId})`,
        watchedAt: sql`COALESCE(${fromWork(works.watchedAt)}, ${fromRecord(RECORD_WATCHED_AT)})`,
        watchedBy: sql`COALESCE(${fromWork(works.watchedBy)}, ${fromRecord('created_by')})`,
      })
      .onConflictDoNothing()
  })
  const updates = list.flatMap((video) => {
    const row = existing.get(video.videoId)
    if (!row) return []
    const detail = details[video.videoId]
    const durationSec = detail?.durationSec ?? null
    const viewCount = detail?.viewCount ?? null
    if (
      video.title === row.title &&
      (durationSec ?? row.durationSec) === row.durationSec &&
      (viewCount ?? row.viewCount) === row.viewCount &&
      (video.publishedAt ?? row.publishedAt) === row.publishedAt
    )
      return []
    return [
      db
        .update(channelVideos)
        .set({
          title: video.title,
          // What the API did not give this time does not erase what was there
          durationSec: sql`COALESCE(${durationSec}, ${channelVideos.durationSec})`,
          viewCount: sql`COALESCE(${viewCount}, ${channelVideos.viewCount})`,
          publishedAt: sql`COALESCE(${video.publishedAt}, ${channelVideos.publishedAt})`,
          updatedAt: sql`datetime('now')`,
        })
        .where(eq(channelVideos.videoId, video.videoId)),
    ]
  })
  // The inserts stay in their order (each takes the place above the one before it)
  const statements = [...inserts, ...updates]
  for (let i = 0; i < statements.length; i += WRITE_BATCH) {
    const [first, ...rest] = statements.slice(i, i + WRITE_BATCH)
    if (first) await db.batch([first, ...rest])
  }
  return { added: inserts.length, updated: updates.length }
}

/** Works without a video, linked by name to their vendor's videos, as the import does */
export async function linkWorksByName(db: Db): Promise<number> {
  const open = await db
    .select({
      sourceUrl: works.sourceUrl,
      title: works.title,
      vendorId: works.vendorId,
      youtubeVideoId: works.youtubeVideoId,
    })
    .from(works)
    .where(isNotNull(works.vendorId))
  if (!open.some((w) => w.youtubeVideoId === null)) return 0
  const candidates = await db
    .select({
      videoId: channelVideos.videoId,
      title: channelVideos.title,
      vendorId: channelVideos.vendorId,
      kind: channelVideos.kind,
    })
    .from(channelVideos)
    .where(isNotNull(channelVideos.vendorId))
  const pairs = matchWorksToVideos(open, candidates)
  if (pairs.length === 0) return 0
  for (const statement of workVideoLinkSql(pairs)) await db.run(sql.raw(statement))
  return pairs.length
}

/**
 * Refreshes every channel. One channel failing (quota, network) does not stop the others; the
 * error is returned for the log line.
 */
export async function refreshChannelVideos(
  db: Db,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ channels: ChannelRefreshResult[]; linked: number }> {
  const channels = await db
    .select({
      channelId: channelVideos.channelId,
      channel: sql<string>`min(${channelVideos.channel})`,
      vendorId: sql<string | null>`min(${channelVideos.vendorId})`,
    })
    .from(channelVideos)
    .groupBy(channelVideos.channelId)
  const results: ChannelRefreshResult[] = []
  for (const channel of channels) {
    try {
      const counts = await saveChannel(
        db,
        channel,
        await fetchChannel(channel.channelId, apiKey, fetchImpl),
      )
      results.push({ channel: channel.channel, ...counts, error: null })
    } catch (e) {
      results.push({
        channel: channel.channel,
        added: 0,
        updated: 0,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return { channels: results, linked: await linkWorksByName(db) }
}
