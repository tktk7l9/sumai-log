/**
 * Filtering of the video memos (記録 > 動画) on the page. The memos grow by about 35 a week
 * and were a single column of large cards with no way to find one (25,000px for 72 memos,
 * 2026-10-06); the tags and the vendor, which every memo has, are what to narrow by.
 */

export type VideoForFilter = {
  title: string
  channel: string | null
  tags: string[]
  vendorId: string | null
}

export type VideoFilter = {
  tag?: string
  vendorId?: string
  /** Part of the title or the channel */
  q?: string
}

/** Same folding as the glossary search: width, case, spaces, katakana to hiragana */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/gu, '')
    .replace(/[ァ-ヶ]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

export function filterVideos<T extends VideoForFilter>(videos: T[], filter: VideoFilter): T[] {
  const q = filter.q ? normalizeSearch(filter.q) : ''
  return videos.filter((v) => {
    if (filter.tag && !v.tags.includes(filter.tag)) return false
    if (filter.vendorId && v.vendorId !== filter.vendorId) return false
    if (q && !normalizeSearch(`${v.title}|${v.channel ?? ''}`).includes(q)) return false
    return true
  })
}

/** Most used first; a tie keeps the order of first appearance (the list is newest first) */
function byCount<T extends { count: number }>(a: T, b: T): number {
  return b.count - a.count
}

/** The tags in use, with how many memos carry each */
export function tagOptions(videos: { tags: string[] }[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const v of videos) for (const t of v.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts].map(([name, count]) => ({ name, count })).sort(byCount)
}

/** The vendors with memos, with how many memos each */
export function vendorOptions(
  videos: { vendorId: string | null; vendorName: string | null }[],
): { id: string; name: string; count: number }[] {
  const byId = new Map<string, { id: string; name: string; count: number }>()
  for (const v of videos) {
    if (!v.vendorId || !v.vendorName) continue
    const entry = byId.get(v.vendorId) ?? { id: v.vendorId, name: v.vendorName, count: 0 }
    entry.count++
    byId.set(v.vendorId, entry)
  }
  return [...byId.values()].sort(byCount)
}
