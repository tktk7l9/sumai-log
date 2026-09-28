/**
 * Pure functions for finding and detecting a site's favicon. As in design.md, the policy is
 * not to add an external HTML parser, so `<link>` tags are also extracted with our own regex
 * (the known limit when an attribute value contains `>` is the same as stripTagsOnce in
 * src/lib/news/text.ts).
 *
 * The actual fetch happens in src/server/vendorImages.ts. This file only handles
 * "HTML string -> array of candidate URLs" and "bytes -> image format detection".
 */

import { decodeEntities } from './news/text'

/** Upper limit (in characters) of the HTML passed to pickFaviconCandidates. Beyond this, give up
 * extracting candidates and return only `${origin}/favicon.ico` (do not scan huge HTML just to
 * find a favicon). */
export const MAX_HTML_LENGTH = 2 * 1024 * 1024

// SVG is deliberately not handled: serving it from our own Origin (/api/photos/<key>) as
// image/svg+xml would run an SVG containing a <script> planted by a vendor site as is,
// which is a stored XSS path (the policy is not to add an external sanitising library, so
// there is no safe handling other than not accepting it). sniffFaviconType does not detect
// SVG bytes and returns null, and pickFaviconCandidates does not make a .svg href a candidate.
export type FaviconExt = 'png' | 'ico' | 'jpg' | 'webp'
export type FaviconMimeType = 'image/png' | 'image/x-icon' | 'image/jpeg' | 'image/webp'

const LINK_TAG = /<link\b[^>]*>/gi

/** Reads any of `name="value"` / `name='value'` / `name=value`. Entities are resolved. */
function getAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
  const m = re.exec(tag)
  if (!m) return null
  // One of the 3 alternatives ("..." / '...' / unquoted) always matches, so they are
  // never all undefined (no `?? ''` fallback is needed).
  return decodeEntities((m[1] ?? m[2] ?? m[3]) as string)
}

/**
 * Reads the largest side (px) from `sizes="32x32"` etc. `any` (SVG etc.) and no value are
 * handled by the caller
 */
function maxDeclaredSize(sizesRaw: string | null): number {
  if (!sizesRaw) return 0
  const lower = sizesRaw.toLowerCase()
  if (lower.split(/\s+/).includes('any')) return Number.POSITIVE_INFINITY
  let max = 0
  for (const part of lower.split(/\s+/)) {
    const m = /^(\d+)x(\d+)$/.exec(part)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max
}

function dedupe(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const url of urls) {
    if (seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

type Candidate = { href: string; kind: 'icon' | 'apple-touch'; size: number }

/** Maximum number of declared candidates (excluding the favicon.ico fallback) kept in priority
 * order. Even when an ad template or the like lists many `<link rel="icon">`, this keeps the
 * outbound fetches for saving 1 vendor finite. */
const MAX_DECLARED_CANDIDATES = 5

/**
 * Returns the favicon candidate URLs from the HTML of `pageUrl`, highest priority first.
 * Order: rel="icon"/"shortcut icon" by declared size descending (sizes="any" is top priority)
 * -> rel="apple-touch-icon" (including -precomposed) by size descending in the same way
 * -> always append `${origin}/favicon.ico` at the end (a fallback for sites whose declaration
 * is missing or unreadable).
 * `data:` URLs and `.svg` hrefs are not candidates (SVG is not accepted as an image. See the
 * comment on FaviconExt/FaviconMimeType above. No wasted fetch either). When the same URL is
 * duplicated, only the first occurrence is kept. The favicon.ico fallback remains even when
 * every declaration was .svg.
 * Declared candidates are cut to the top `MAX_DECLARED_CANDIDATES` (5) in priority order, and
 * with the favicon.ico fallback added at most 6 are returned (to cap the caller's outbound
 * fetches).
 *
 * When `pageUrl` cannot be read as a URL, or the HTML exceeds MAX_HTML_LENGTH, an empty
 * array is returned (the caller treats it the same as running out of candidates).
 */
export function pickFaviconCandidates(html: string, pageUrl: string): string[] {
  let origin: string
  try {
    origin = new URL(pageUrl).origin
  } catch {
    return []
  }
  const fallback = `${origin}/favicon.ico`

  if (html.length > MAX_HTML_LENGTH) return [fallback]

  const candidates: Candidate[] = []
  for (const match of html.matchAll(LINK_TAG)) {
    const tag = match[0]
    const relRaw = getAttr(tag, 'rel')
    if (!relRaw) continue
    const rel = relRaw.toLowerCase().trim()
    const isIcon = rel === 'icon' || rel === 'shortcut icon'
    const isAppleTouch = rel === 'apple-touch-icon' || rel === 'apple-touch-icon-precomposed'
    if (!isIcon && !isAppleTouch) continue

    const hrefRaw = getAttr(tag, 'href')
    if (!hrefRaw || hrefRaw.trim().toLowerCase().startsWith('data:')) continue

    let resolved: string
    try {
      resolved = new URL(hrefRaw, pageUrl).href
    } catch {
      continue
    }
    if (/\.svg(?:[?#]|$)/i.test(resolved)) continue // SVG is not a candidate (see the comment above)

    const size = maxDeclaredSize(getAttr(tag, 'sizes'))
    candidates.push({ href: resolved, kind: isIcon ? 'icon' : 'apple-touch', size })
  }

  const bySize = (a: Candidate, b: Candidate) => b.size - a.size
  const icons = candidates.filter((c) => c.kind === 'icon').sort(bySize)
  const appleTouch = candidates.filter((c) => c.kind === 'apple-touch').sort(bySize)

  const declared = dedupe([...icons, ...appleTouch].map((c) => c.href))
  const capped = declared.slice(0, MAX_DECLARED_CANDIDATES)
  return dedupe([...capped, fallback])
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function asciiAt(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, to))
}

/**
 * Detects the image format from the magic bytes. SVG is deliberately not detected (see the
 * comment on FaviconExt/FaviconMimeType above. As a stored XSS countermeasure it is always
 * null = not used as an image).
 * Returns null when nothing matches (not used as a favicon).
 */
export function sniffFaviconType(bytes: Uint8Array): FaviconMimeType | null {
  if (bytes.length >= 8 && PNG_MAGIC.every((b, i) => bytes[i] === b)) return 'image/png'
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x01 &&
    bytes[3] === 0x00
  ) {
    return 'image/x-icon'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg'
  if (bytes.length >= 12 && asciiAt(bytes, 0, 4) === 'RIFF' && asciiAt(bytes, 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  return null
}

const EXT_BY_TYPE: Record<FaviconMimeType, FaviconExt> = {
  'image/png': 'png',
  'image/x-icon': 'ico',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function extForType(type: FaviconMimeType): FaviconExt {
  return EXT_BY_TYPE[type]
}
