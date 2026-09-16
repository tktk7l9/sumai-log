/**
 * サイトのファビコン探索・判定の純粋関数。design.md 同様、外部 HTML パーサは入れない
 * 方針なので、`<link>` タグの抽出も自前の正規表現（属性値の中に `>` があるケースの
 * 既知の限界は src/lib/news/text.ts の stripTagsOnce と同じ）で行う。
 *
 * 実際に fetch するのは src/server/vendorImages.ts。ここは
 * 「HTML 文字列 → 候補 URL の配列」と「バイト列 → 画像形式の判定」だけを担う。
 */

import { decodeEntities } from './news/text'

/** pickFaviconCandidates に渡す HTML の上限（文字数）。これを超えたら候補抽出を諦め、
 * `${origin}/favicon.ico` だけを返す（favicon 探索のために巨大な HTML を舐めない）。 */
export const MAX_HTML_LENGTH = 2 * 1024 * 1024

// SVG は意図的に扱わない: 自分の Origin（/api/photos/<key>）から image/svg+xml として
// 配信すると、業者サイトが仕込んだ <script> 入りの SVG がそのまま実行される
// stored XSS の経路になる（サニタイズ用の外部ライブラリは入れない方針のため、
// 「受け付けない」以外に安全な対処が無い）。sniffFaviconType は SVG のバイト列を
// 判定せず null を返し、pickFaviconCandidates も .svg の href を候補にしない。
export type FaviconExt = 'png' | 'ico' | 'jpg' | 'webp'
export type FaviconMimeType = 'image/png' | 'image/x-icon' | 'image/jpeg' | 'image/webp'

const LINK_TAG = /<link\b[^>]*>/gi

/** `name="value"` / `name='value'` / `name=value` のいずれの書式でも読む。エンティティは解決する。 */
function getAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
  const m = re.exec(tag)
  if (!m) return null
  // 3 つの代替（"..." / '...' / 無クォート）のどれかは必ず一致しているので、
  // すべて undefined になることは無い（?? '' の保険は要らない）。
  return decodeEntities((m[1] ?? m[2] ?? m[3]) as string)
}

/** `sizes="32x32"` 等から最大の一辺（px）を読む。`any`（SVG 等）や指定無しは呼び出し側で扱う */
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

/**
 * `pageUrl` の HTML から favicon の候補 URL を、優先度の高い順に並べて返す。
 * 並び: rel="icon"/"shortcut icon" を宣言サイズの大きい順（sizes="any" は最優先）
 * → rel="apple-touch-icon"（-precomposed 含む）を同様に大きい順
 * → 末尾に必ず `${origin}/favicon.ico` を足す（宣言が無い/読めないサイト向けの保険）。
 * `data:` URL・`.svg` の href は候補にしない（SVG は画像として受け付けない。上の
 * FaviconExt/FaviconMimeType のコメント参照。無駄な fetch もしない）。同じ URL が
 * 重複したら最初の出現だけ残す。宣言が全部 .svg だった場合も favicon.ico の保険は残る。
 *
 * `pageUrl` が URL として読めない、または HTML が MAX_HTML_LENGTH を超える場合は
 * 空配列を返す（呼び出し側は候補が尽きたのと同じ扱いになる）。
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
    if (/\.svg(?:[?#]|$)/i.test(resolved)) continue // SVG は候補にしない（上のコメント参照）

    const size = maxDeclaredSize(getAttr(tag, 'sizes'))
    candidates.push({ href: resolved, kind: isIcon ? 'icon' : 'apple-touch', size })
  }

  const bySize = (a: Candidate, b: Candidate) => b.size - a.size
  const icons = candidates.filter((c) => c.kind === 'icon').sort(bySize)
  const appleTouch = candidates.filter((c) => c.kind === 'apple-touch').sort(bySize)

  return dedupe([...icons, ...appleTouch].map((c) => c.href).concat(fallback))
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function asciiAt(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, to))
}

/**
 * マジックバイトで画像形式を判定する。SVG は意図的に判定しない（上の FaviconExt/
 * FaviconMimeType のコメント参照。stored XSS 対策のため一律 null = 「画像として使わない」）。
 * どれにも一致しなければ null（favicon として使わない）。
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
