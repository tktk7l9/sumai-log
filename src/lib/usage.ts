/**
 * Pure functions for "環境" (Environment: resource usage) and "利用者" (Users: last used
 * time) on the settings page.
 *
 * Usage covers only what can be known from inside the Worker: the size of the D1 database
 * (meta.size_after of a query result) and the row count per table, and the number of R2
 * objects and their total size. The number of reads and writes per day and the number of
 * requests cannot be obtained from the Worker (look at the dashboard).
 *
 * "最後に使った日時" (Last used) is not the Cloudflare Access login time but the time of
 * the last request with that email (an Access session lasts about 1 month, and the moment
 * of login is not visible from the app). It is held in the settings table under the key
 * `lastSeen:<email>`.
 */

/** The Cloudflare free tier (as of 2026-09). Storage of 5 GB for D1 and 10 GB for R2 */
export const D1_FREE_BYTES = 5 * 1024 ** 3
export const R2_FREE_BYTES = 10 * 1024 ** 3

/** 1,234 -> '1.2 KB'. Small values stay in bytes, and 1 KB or more gets 1 decimal place */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB'] as const
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)} ${units[i]}`
}

/** The percentage of the limit (%, 1 decimal place). 0 when the limit is 0 or less */
export function percentOf(used: number, limit: number): number {
  if (limit <= 0 || !Number.isFinite(used) || used <= 0) return 0
  return Math.round((used / limit) * 1000) / 10
}

/** The interval (ms) for rewriting the last used time of the same person. Does not write to
 * D1 on every request */
export const SEEN_INTERVAL_MS = 10 * 60 * 1000

/** true when the interval has passed since the last write (always true the first time) */
export function shouldRecordSeen(
  lastWrittenMs: number | undefined,
  nowMs: number,
  intervalMs: number = SEEN_INTERVAL_MS,
): boolean {
  if (lastWrittenMs === undefined) return true
  return nowMs - lastWrittenMs >= intervalMs
}

export const LAST_SEEN_PREFIX = 'lastSeen:'

export function lastSeenKey(email: string): string {
  return `${LAST_SEEN_PREFIX}${email.trim().toLowerCase()}`
}

/** Takes the email out of a `lastSeen:<email>` key. null when the shape is wrong */
export function emailFromLastSeenKey(key: string): string | null {
  if (!key.startsWith(LAST_SEEN_PREFIX)) return null
  const email = key.slice(LAST_SEEN_PREFIX.length)
  return email === '' ? null : email
}

/** The tables whose rows are counted, and the names shown on screen (table names are not
 * shown to users) */
export const COUNTED_TABLES = [
  'vendors',
  'properties',
  'places',
  'events',
  'visits',
  'photos',
  'videos',
  'comments',
  'vendor_news',
  'inbound_mails',
  'sources',
] as const
export type CountedTable = (typeof COUNTED_TABLES)[number]
export const COUNTED_TABLE_LABEL: Record<CountedTable, string> = {
  vendors: '業者',
  properties: '物件',
  places: '場所',
  events: '予定',
  visits: '見学記録',
  photos: '写真',
  videos: '動画メモ',
  comments: 'コメント',
  vendor_news: 'お知らせ',
  inbound_mails: 'メール',
  sources: '情報源',
}

/** Lists them like "見学記録 12・写真 40・…" (visit records 12, photos 40, ...), omitting 0
 * counts. 'なし' (none) when everything is 0 */
export function formatRowCounts(rows: Partial<Record<CountedTable, number>>): string {
  const parts = COUNTED_TABLES.filter((t) => (rows[t] ?? 0) > 0).map(
    (t) => `${COUNTED_TABLE_LABEL[t]} ${rows[t]!.toLocaleString('ja-JP')}`,
  )
  return parts.length > 0 ? parts.join('・') : 'なし'
}
