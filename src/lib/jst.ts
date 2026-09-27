/**
 * Displays the time representations that flow into the ledger in JST.
 *
 * D1's datetime('now') is 'YYYY-MM-DD HH:MM:SS' (UTC, no offset).
 * Other input sources may arrive as ISO 8601 (with an offset such as 'Z' or '+09:00',
 * or without an offset). Without an offset it is treated as UTC.
 * `new Date().toISOString()` (which the repository upsert uses for updatedAt) always
 * contains seconds with 3 decimal places ('.333' etc.), so fractional seconds are accepted too.
 * Date.now() is not used (to keep these pure functions independent of the call time).
 */

import { formatDateSlash } from './calendar'

const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/

/**
 * Converts to UTC milliseconds. Accepts D1's 'YYYY-MM-DD HH:MM:SS' (no offset = UTC) and
 * ISO 8601 (with an offset such as 'Z' / '+09:00', or no offset = UTC; fractional seconds
 * may be present or absent). A string that does not match the shape of this regex gives
 * null (the caller uses it for fallbacks such as "unreadable = keep the original string".
 * feed.ts reads the null from here as "treat as the oldest").
 */
export function parseToUtcMs(value: string): number | null {
  const match = DATE_TIME_PATTERN.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute, second, fraction, offset] = match
  const ms = offset
    ? Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${fraction ?? ''}${offset}`)
    : Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
        fraction ? Math.round(Number(fraction) * 1000) : 0,
      )
  // Even when the regex shape matches, Date.parse returns NaN if the month or day does not
  // exist ('2026-09-32' etc.). Turn it into null so it joins the "unreadable" handling
  // (the callers already check utcMs === null).
  return Number.isNaN(ms) ? null : ms
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Converts to JST 'YYYY/MM/DD HH:mm' ('YYYY/MM/DD' with withTime: false). Every displayed
 * date is unified to the `/` separator (the owner's request. formatDateSlash in
 * src/lib/calendar.ts). A string that cannot be interpreted is returned as is.
 */
export function formatJst(value: string, opts?: { withTime?: boolean }): string {
  const utcMs = parseToUtcMs(value)
  if (utcMs === null) return value

  const jst = new Date(utcMs + 9 * 60 * 60 * 1000)
  const datePart = formatDateSlash(
    `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`,
  )
  if (opts?.withTime === false) return datePart
  return `${datePart} ${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}`
}

/**
 * The JST 'YYYY-MM-DD' key (kept hyphen-separated. Unlike formatJst, which is for display, this
 * is a key, so it is not `/`-separated). There is no caller inside the app right now. Kept as
 * public API of lib
 */
export function toJstDateKey(value: string): string {
  const utcMs = parseToUtcMs(value)
  if (utcMs === null) return value

  const jst = new Date(utcMs + 9 * 60 * 60 * 1000)
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`
}

/**
 * Returns only the JST 'HH:mm'. A string that cannot be interpreted gives an empty string
 * (for places where a heading needs no time)
 */
export function formatJstTime(value: string): string {
  const utcMs = parseToUtcMs(value)
  if (utcMs === null) return ''

  const jst = new Date(utcMs + 9 * 60 * 60 * 1000)
  return `${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}`
}
