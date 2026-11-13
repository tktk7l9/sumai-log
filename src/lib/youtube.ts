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

/**
 * 'large' is hqdefault (480x360, 4:3 with black bars above and below a 16:9 video), for a
 * picture shown wide. 'small' is mqdefault (320x180, 16:9, about half the bytes), for the
 * pictures of list cards (128x72 and smaller on a phone). Both exist for every video
 */
export function youtubeThumbnailUrl(id: string, size: 'large' | 'small' = 'large'): string {
  return `https://i.ytimg.com/vi/${id}/${size === 'small' ? 'mqdefault' : 'hqdefault'}.jpg`
}

/** How much of a pasted text is searched for a link (a copied link sits at its start) */
const PASTE_SCAN_MAX = 2000

/** A link ends at whitespace, a quote, or the brackets and punctuation Japanese text puts after it */
const LINK = /https?:\/\/[^\s<>"'「」『』（）()、。，]+/g

/**
 * The first YouTube video link in what was copied or pasted, or null. The YouTube app copies the
 * bare link, but other apps copy the title with it, or a sentence around it (SHIG 50, 46).
 */
export function findYouTubeUrl(text: string): string | null {
  for (const [link] of text.slice(0, PASTE_SCAN_MAX).matchAll(LINK)) {
    if (parseYouTubeId(link)) return link
  }
  return null
}
