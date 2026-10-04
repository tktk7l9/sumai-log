import { sqlValue } from '../works/sql'

/**
 * Turning the output of `yt-dlp --flat-playlist -J` for the vendors' channels into upserts of
 * channel_videos (scripts/import-channel-videos.ts). Which channels are read is real data and
 * lives in the gitignored seed.local/channel-videos.json.
 */

export type ChannelVideoKind = 'video' | 'short' | 'live'

export type ChannelConfig = {
  /** YouTube channel id ('UC…') */
  channelId: string
  /** Shown on the screen and used for the channel filter */
  name: string
  /** vendors.id to link the videos to, or null */
  vendorId: string | null
}

/** The channel tabs read, in the order the rows are numbered: newest first inside each tab */
export const CHANNEL_TABS: { tab: string; kind: ChannelVideoKind }[] = [
  { tab: 'videos', kind: 'video' },
  { tab: 'streams', kind: 'live' },
  { tab: 'shorts', kind: 'short' },
]

export type FlatEntry = {
  videoId: string
  title: string
  durationSec: number | null
  viewCount: number | null
}

export type ParsedChannelVideo = FlatEntry & {
  channelId: string
  channel: string
  vendorId: string | null
  kind: ChannelVideoKind
  sortOrder: number
  /** ISO-8601 (UTC), read from the video's own page; null when it could not be read */
  publishedAt: string | null
}

function fail(reason: string): never {
  throw new Error(`seed.local/channel-videos.json: ${reason}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const CHANNEL_ID = /^UC[\w-]{22}$/
const VIDEO_ID = /^[\w-]{11}$/

/** Shape: { "channels": [{ "channelId", "name", "vendorId"? }] } */
export function parseChannelsConfig(json: unknown): ChannelConfig[] {
  if (!isRecord(json) || !Array.isArray(json.channels) || json.channels.length === 0) {
    fail('expected { "channels": [ ... ] } with at least one channel')
  }
  const seen = new Set<string>()
  return (json.channels as unknown[]).map((raw, i) => {
    if (!isRecord(raw)) fail(`channels[${i}] is not an object`)
    const { channelId, name, vendorId = null } = raw
    if (typeof channelId !== 'string' || !CHANNEL_ID.test(channelId) || seen.has(channelId)) {
      fail(`channels[${i}].channelId must be a unique 'UC…' channel id`)
    }
    seen.add(channelId)
    if (typeof name !== 'string' || name.trim() === '') fail(`channels[${i}].name is empty`)
    if (vendorId !== null && typeof vendorId !== 'string') {
      fail(`channels[${i}].vendorId must be a string or null`)
    }
    return { channelId, name: name.trim(), vendorId }
  })
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null
}

/**
 * The entries of one channel tab. yt-dlp prints `null` for a tab the channel does not have, and
 * an entry without a usable id or title (a deleted or private video) is skipped.
 */
export function parseFlatPlaylist(json: unknown): FlatEntry[] {
  if (!isRecord(json) || !Array.isArray(json.entries)) return []
  return json.entries.flatMap((raw): FlatEntry[] => {
    if (!isRecord(raw)) return []
    const { id, title } = raw
    if (typeof id !== 'string' || !VIDEO_ID.test(id)) return []
    if (typeof title !== 'string' || title.trim() === '') return []
    return [
      {
        videoId: id,
        title: title.trim(),
        durationSec: count(raw.duration),
        viewCount: count(raw.view_count),
      },
    ]
  })
}

/** All videos of one channel, numbered across the tabs in CHANNEL_TABS order; a repeat is kept once */
export function channelVideosOf(
  channel: ChannelConfig,
  tabs: { kind: ChannelVideoKind; entries: FlatEntry[] }[],
): ParsedChannelVideo[] {
  const seen = new Set<string>()
  const out: ParsedChannelVideo[] = []
  for (const { kind, entries } of tabs) {
    for (const entry of entries) {
      if (seen.has(entry.videoId)) continue
      seen.add(entry.videoId)
      out.push({
        ...entry,
        channelId: channel.channelId,
        channel: channel.name,
        vendorId: channel.vendorId,
        kind,
        sortOrder: out.length,
        publishedAt: null,
      })
    }
  }
  return out
}

/**
 * When the video was published, from its watch page (the flat channel list has no dates). The
 * page writes it in YouTube's own time zone with an offset, e.g. 2026-09-22T02:00:07-07:00.
 */
export function publishedAtFromWatchPage(html: string): string | null {
  const raw =
    /itemprop="datePublished" content="([^"]+)"/.exec(html)?.[1] ??
    /"publishDate":"([^"]+)"/.exec(html)?.[1]
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/**
 * The watched time a video record stands for, as SQL: its watched date at 00:00 JST, or when it
 * was recorded when the date is empty. Also used by the one-off backfill in the import script
 */
export const RECORD_WATCHED_AT =
  "COALESCE(watched_on || 'T00:00:00+09:00', replace(created_at, ' ', 'T') || 'Z')"

/** Columns the channel decides. id, created_at and watched_* are the app's */
const CHANNEL_COLUMNS = [
  'channel_id',
  'channel',
  'vendor_id',
  'kind',
  'title',
  'duration_sec',
  'view_count',
  'sort_order',
] as const

/**
 * Upsert of one video keyed by video_id. Re-running never touches the watched flag. A new row
 * starts as watched when the same video is a work's tour video that was already watched, or
 * is already in the video records (動画の記録: being recorded means it was watched). A date
 * that could not be read this time does not erase the one read before.
 */
export function channelVideoUpsertSql(video: ParsedChannelVideo, id: string): string {
  const values: Record<(typeof CHANNEL_COLUMNS)[number], string | number | null> = {
    channel_id: video.channelId,
    channel: video.channel,
    vendor_id: video.vendorId,
    kind: video.kind,
    title: video.title,
    duration_sec: video.durationSec,
    view_count: video.viewCount,
    sort_order: video.sortOrder,
  }
  const vid = sqlValue(video.videoId)
  const fromWork = (column: string) =>
    `(SELECT ${column} FROM works WHERE youtube_video_id = ${vid} AND watched_at IS NOT NULL LIMIT 1)`
  const fromRecord = (expression: string) =>
    `(SELECT ${expression} FROM videos WHERE video_id = ${vid} ORDER BY created_at LIMIT 1)`
  const columns = ['id', 'video_id', ...CHANNEL_COLUMNS, 'published_at', 'watched_at', 'watched_by']
  const literals = [
    sqlValue(id),
    vid,
    ...CHANNEL_COLUMNS.map((c) => sqlValue(values[c])),
    sqlValue(video.publishedAt),
    `COALESCE(${fromWork('watched_at')}, ${fromRecord(RECORD_WATCHED_AT)})`,
    `COALESCE(${fromWork('watched_by')}, ${fromRecord('created_by')})`,
  ]
  const updates = [
    ...CHANNEL_COLUMNS.map((c) => `${c} = excluded.${c}`),
    'published_at = COALESCE(excluded.published_at, channel_videos.published_at)',
    "updated_at = datetime('now')",
  ]
  return (
    `INSERT INTO channel_videos (${columns.join(', ')}) VALUES (${literals.join(', ')}) ` +
    `ON CONFLICT(video_id) DO UPDATE SET ${updates.join(', ')};`
  )
}

/**
 * Rows imported before they were recorded: marks every channel video and work whose video is
 * in the video records and is not watched yet. Safe to run again; appended to every import
 */
export function recordedWatchedBackfillSql(): string[] {
  const target = (table: string, column: string) => {
    const record = (expression: string) =>
      `(SELECT ${expression} FROM videos WHERE videos.video_id = ${table}.${column} ORDER BY created_at LIMIT 1)`
    return (
      `UPDATE ${table} SET watched_at = ${record(RECORD_WATCHED_AT)}, ` +
      `watched_by = ${record('created_by')}, updated_at = datetime('now') ` +
      `WHERE watched_at IS NULL AND ${column} IN (SELECT video_id FROM videos);`
    )
  }
  return [target('channel_videos', 'video_id'), target('works', 'youtube_video_id')]
}

/** Ids per videos.list call of the YouTube Data API (its maximum) */
export const VIDEOS_LIST_BATCH = 50

/** videos.list for up to 50 ids, asking only for the published date (1 quota unit per call) */
export function videosListUrl(videoIds: string[], apiKey: string): string {
  const params = new URLSearchParams({
    part: 'snippet',
    id: videoIds.join(','),
    fields: 'items(id,snippet/publishedAt)',
    maxResults: String(VIDEOS_LIST_BATCH),
    key: apiKey,
  })
  return `https://www.googleapis.com/youtube/v3/videos?${params}`
}

/** videoId -> ISO date (UTC) from a videos.list response. A deleted or private video is simply absent */
export function publishedAtFromVideosList(json: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!isRecord(json) || !Array.isArray(json.items)) return out
  for (const item of json.items) {
    if (!isRecord(item) || typeof item.id !== 'string' || !isRecord(item.snippet)) continue
    const raw = item.snippet.publishedAt
    const ms = typeof raw === 'string' ? Date.parse(raw) : Number.NaN
    if (!Number.isNaN(ms)) out[item.id] = new Date(ms).toISOString()
  }
  return out
}
