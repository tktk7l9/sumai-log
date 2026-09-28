/**
 * Parsing and normalisation of YouTube video URLs.
 *
 * Supported hosts: the youtube.com family (bare / www / m / music) and youtu.be.
 * A video ID is accepted only as 11 characters of [A-Za-z0-9_-].
 */

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
])

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

/** No caller inside the app right now. Kept as public API of lib */
export function isYouTubeHost(hostname: string): boolean {
  return YOUTUBE_HOSTS.has(hostname.toLowerCase())
}

function pathSegments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean)
}

/** Extracts the video id candidate from each shape, youtube.com family and youtu.be (unvalidated) */
function extractId(host: string, pathname: string, searchParams: URLSearchParams): string {
  if (host === 'youtu.be') return pathSegments(pathname)[0] ?? ''

  const [first, second] = pathSegments(pathname)
  if (first === 'watch') return searchParams.get('v') ?? ''
  if (first === 'shorts' || first === 'embed' || first === 'live') return second ?? ''
  return ''
}

/**
 * Extracts the video id from a YouTube URL. Returns null for schemes other than
 * http/https (file: / ftp: / ws: / javascript: and so on), unsupported hosts or paths,
 * an id that is not 11 characters, and an empty string. Trims leading and trailing whitespace.
 */
export function parseYouTubeId(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const host = parsed.hostname.toLowerCase()
  if (!isYouTubeHost(host)) return null

  const id = extractId(host, parsed.pathname, parsed.searchParams)
  return ID_PATTERN.test(id) ? id : null
}

export function canonicalYouTubeUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}

export function youtubeThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}
