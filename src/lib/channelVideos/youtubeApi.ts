import type { ChannelVideoKind } from './import'
import { VIDEOS_LIST_BATCH } from './import'

/**
 * The YouTube Data API calls of the daily refresh (src/server/channelVideosFetcher.ts). A channel
 * 'UC…' has one uploads playlist per kind: UULF… (videos), UULV… (live) and UUSH… (shorts), so the
 * kind comes from the playlist rather than from guessing by length.
 */

const API = 'https://www.googleapis.com/youtube/v3'

/** Kind -> the prefix that replaces 'UC' of the channel id */
const PLAYLIST_PREFIX: Record<ChannelVideoKind, string> = {
  video: 'UULF',
  live: 'UULV',
  short: 'UUSH',
}

/** Read in the same order as the yt-dlp import numbers them */
export const API_KINDS: ChannelVideoKind[] = ['video', 'live', 'short']

export function kindPlaylistId(channelId: string, kind: ChannelVideoKind): string {
  return PLAYLIST_PREFIX[kind] + channelId.slice(2)
}

/** The newest 50 items of one playlist (1 quota unit). Newer videos than that wait for the next day */
export function playlistItemsUrl(playlistId: string, apiKey: string): string {
  const params = new URLSearchParams({
    part: 'snippet,contentDetails',
    playlistId,
    maxResults: String(VIDEOS_LIST_BATCH),
    fields: 'items(snippet/title,contentDetails(videoId,videoPublishedAt))',
    key: apiKey,
  })
  return `${API}/playlistItems?${params}`
}

/** Length and views for up to 50 ids (1 quota unit) */
export function videoDetailsUrl(videoIds: string[], apiKey: string): string {
  const params = new URLSearchParams({
    part: 'contentDetails,statistics',
    id: videoIds.join(','),
    fields: 'items(id,contentDetails/duration,statistics/viewCount)',
    maxResults: String(VIDEOS_LIST_BATCH),
    key: apiKey,
  })
  return `${API}/videos?${params}`
}

export type PlaylistVideo = {
  videoId: string
  title: string
  /** ISO-8601 (UTC); null for a video not public yet */
  publishedAt: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const VIDEO_ID = /^[\w-]{11}$/
/** A private or deleted video stays in the playlist under these titles */
const HIDDEN_TITLES = new Set(['Private video', 'Deleted video'])

function isoOrNull(raw: unknown): string | null {
  const ms = typeof raw === 'string' ? Date.parse(raw) : Number.NaN
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/** Items of a playlistItems.list response, newest first, without private or deleted videos */
export function parsePlaylistItems(json: unknown): PlaylistVideo[] {
  if (!isRecord(json) || !Array.isArray(json.items)) return []
  return json.items.flatMap((item): PlaylistVideo[] => {
    if (!isRecord(item) || !isRecord(item.snippet) || !isRecord(item.contentDetails)) return []
    const { videoId } = item.contentDetails
    const title = typeof item.snippet.title === 'string' ? item.snippet.title.trim() : ''
    if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) return []
    if (title === '' || HIDDEN_TITLES.has(title)) return []
    return [{ videoId, title, publishedAt: isoOrNull(item.contentDetails.videoPublishedAt) }]
  })
}

/** ISO-8601 duration (PT1H2M3S, P1DT2S) -> seconds; null when it is not one */
export function parseIsoDuration(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(raw)
  if (!m || raw === 'P' || raw.endsWith('T')) return null
  const [d, h, min, s] = m.slice(1).map((n) => Number(n ?? 0)) as [number, number, number, number]
  return ((d * 24 + h) * 60 + min) * 60 + s
}

export type VideoDetails = { durationSec: number | null; viewCount: number | null }

/** videoId -> length and views from a videos.list response; a hidden view count stays null */
export function parseVideoDetails(json: unknown): Record<string, VideoDetails> {
  const out: Record<string, VideoDetails> = {}
  if (!isRecord(json) || !Array.isArray(json.items)) return out
  for (const item of json.items) {
    if (!isRecord(item) || typeof item.id !== 'string') continue
    const duration = isRecord(item.contentDetails) ? item.contentDetails.duration : null
    const views = isRecord(item.statistics) ? Number(item.statistics.viewCount) : Number.NaN
    out[item.id] = {
      // Live streams still running report P0D
      durationSec: parseIsoDuration(duration) || null,
      viewCount: Number.isFinite(views) && views >= 0 ? views : null,
    }
  }
  return out
}
