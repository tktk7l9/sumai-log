/**
 * YouTube の動画 URL 解析・正規化。
 *
 * 対応ホスト: youtube.com 系（bare / www / m / music）と youtu.be。
 * 動画 ID は 11 文字の [A-Za-z0-9_-] のみを受ける。
 */

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
])

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

export function isYouTubeHost(hostname: string): boolean {
  return YOUTUBE_HOSTS.has(hostname.toLowerCase())
}

function pathSegments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean)
}

/** youtube.com 系・youtu.be それぞれの形から動画 id 候補を取り出す（未検証） */
function extractId(host: string, pathname: string, searchParams: URLSearchParams): string {
  if (host === 'youtu.be') return pathSegments(pathname)[0] ?? ''

  const [first, second] = pathSegments(pathname)
  if (first === 'watch') return searchParams.get('v') ?? ''
  if (first === 'shorts' || first === 'embed' || first === 'live') return second ?? ''
  return ''
}

/**
 * YouTube の URL から動画 id を取り出す。http/https 以外のスキーム
 * （file: / ftp: / ws: / javascript: など）、対応外のホスト・パス、
 * 11 文字でない id、空文字は null。前後の空白は trim する。
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
