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
      })
    }
  }
  return out
}

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
 * starts as watched when the same video is a work's tour video that was already watched.
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
  const watchedFrom = (column: string) =>
    `(SELECT ${column} FROM works WHERE youtube_video_id = ${sqlValue(video.videoId)} AND watched_at IS NOT NULL LIMIT 1)`
  const columns = ['id', 'video_id', ...CHANNEL_COLUMNS, 'watched_at', 'watched_by']
  const literals = [
    sqlValue(id),
    sqlValue(video.videoId),
    ...CHANNEL_COLUMNS.map((c) => sqlValue(values[c])),
    watchedFrom('watched_at'),
    watchedFrom('watched_by'),
  ]
  const updates = [
    ...CHANNEL_COLUMNS.map((c) => `${c} = excluded.${c}`),
    "updated_at = datetime('now')",
  ]
  return (
    `INSERT INTO channel_videos (${columns.join(', ')}) VALUES (${literals.join(', ')}) ` +
    `ON CONFLICT(video_id) DO UPDATE SET ${updates.join(', ')};`
  )
}
