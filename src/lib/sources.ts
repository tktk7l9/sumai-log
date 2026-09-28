/**
 * Pure functions for the sources page (/sources): grouping by genre, parsing YouTube channel
 * URLs, and deciding whether an avatar URL is allowed. The actual fetch is in
 * src/server/sourcesFetcher.ts.
 */

import { SOURCE_GENRES, type SourceGenre } from '../content/sourceGenres'

/** The group for a genre id that is not in SOURCE_GENRES (genre is plain text in the DB and
 * can be set through seed / SQL). Shown last so that such a source is never silently hidden */
export const OTHER_GENRE = { id: 'other', label: 'その他' } as const

export type SourceGroupGenre = SourceGenre | typeof OTHER_GENRE

/** Groups by genre. Keeps the order of SOURCE_GENRES and leaves out genres with 0 items.
 * Unknown genre ids go into OTHER_GENRE at the end (SHIG 38: what the user entered is theirs).
 * Within each genre, sorts by ascending sortOrder (by name in dictionary order when equal). */
export function groupSourcesByGenre<T extends { genre: string; sortOrder: number; name: string }>(
  sources: readonly T[],
): { genre: SourceGroupGenre; items: T[] }[] {
  const known = new Set<string>(SOURCE_GENRES.map((g) => g.id))
  const byOrder = (a: T, b: T) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ja')
  const groups: { genre: SourceGroupGenre; items: T[] }[] = SOURCE_GENRES.map((genre) => ({
    genre,
    items: sources.filter((s) => s.genre === genre.id).sort(byOrder),
  }))
  groups.push({
    genre: OTHER_GENRE,
    items: sources.filter((s) => !known.has(s.genre)).sort(byOrder),
  })
  return groups.filter((g) => g.items.length > 0)
}

/** The identifier that can be taken from a channel URL. Holds only one of the two (never
 * both) */
export type YoutubeChannelRef = { handle: string } | { channelId: string }

/** Hosts accepted for a channel URL. youtu.be is a short domain for videos only and cannot
 * point to a channel, so it is left out on purpose (this is separate from YOUTUBE_HOSTS in
 * src/lib/youtube.ts) */
const CHANNEL_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
])

/** A real YouTube channel ID is 'UC' + 22 characters (24 in total), but this accepts it
 * somewhat loosely */
const CHANNEL_ID_PATTERN = /^UC[\w-]{10,32}$/

/**
 * Takes the handle ('@…') or the channel ID ('UC…') from a YouTube channel URL.
 * Supported shapes: `/@handle`, `/channel/UC…`, `/c/<custom URL>`, `/user/<legacy username>`.
 * `/c/` and `/user/` carry no channel ID, so that 1 path segment is returned as is as the
 * handle (there is no guarantee that it matches the real `@handle`, but it is enough for
 * the initial value of the form and for deciding the target of resolveSource). Unsupported
 * shapes, strings that cannot be read as a URL, and unsupported hosts including youtu.be
 * give null.
 */
export function parseYoutubeChannelUrl(url: string): YoutubeChannelRef | null {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null

  const host = parsed.hostname.toLowerCase()
  if (!CHANNEL_HOSTS.has(host)) return null

  const [first, second] = parsed.pathname.split('/').filter(Boolean)
  if (!first) return null

  if (first.startsWith('@') && first.length > 1) return { handle: first }
  if (first === 'channel' && second && CHANNEL_ID_PATTERN.test(second)) {
    return { channelId: second }
  }
  if ((first === 'c' || first === 'user') && second) return { handle: second }
  return null
}

/** Whether the URL may be shown as a channel avatar (https + host allowlist).
 * i.ytimg.com is shared with video thumbnails, but some pages return the channel icon from
 * it (a path other than `/vi/.../hqdefault.jpg`), so it is included in the allowlist. */
const AVATAR_HOSTS = new Set(['yt3.ggpht.com', 'yt3.googleusercontent.com', 'i.ytimg.com'])

export function isAllowedAvatarUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return parsed.protocol === 'https:' && AVATAR_HOSTS.has(parsed.hostname.toLowerCase())
}

/** The wording used to rephrase a duplicate sources.url (a violation of the D1 UNIQUE
 * constraint) for the user. Both src/server/repository/sources.ts (the side that detects
 * and throws) and src/components/sources/SourceForm.tsx (the side that shows it as the
 * field error of the URL field) use this constant (this avoids duplicating the string and
 * prevents the accident where only one side is fixed and they diverge). */
export const DUPLICATE_URL_ERROR = 'この URL は登録済みです'
