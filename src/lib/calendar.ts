import { dayOfWeek } from './holidays'

/**
 * Date-time representation of events. Stored in the DB as TEXT: all-day is 'YYYY-MM-DD',
 * timed is 'YYYY-MM-DDTHH:MM:00+09:00' (the Japan time offset is explicit).
 * The date key is the first 10 characters. Never converted to a Date object (time zones
 * break it).
 */

export function dateKey(startsAt: string): string {
  return startsAt.slice(0, 10)
}

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const

/**
 * All date display is unified to `/` separators (owner's request). A single
 * implementation that only turns 'YYYY-MM-DD' into 'YYYY/MM/DD'. A string that is not
 * hyphen-separated or has a different shape is returned as is (the same fallback policy
 * as the other formatXxx). dateKey, search parameters and DB values are not touched (this
 * is applied only at display time).
 */
export function formatDateSlash(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return key
  return `${m[1]}/${m[2]}/${m[3]}`
}

/** Turns 'YYYY-MM-DD' into '2026/09/20（日）'. An unreadable string is returned as is. */
export function formatDateWithWeekday(key: string): string {
  const day = dayOfWeek(key)
  if (day === null) return key
  return `${formatDateSlash(key)}（${WEEKDAY_LABELS[day]}）`
}

/**
 * Turns 'YYYY-MM-DD' into '2026/09/12(土)' (for EventBadge and the "行く" (Go) button).
 * All dates are aligned to YYYY/MM/DD (owner's request, 2026-09-23). Unlike
 * formatDateWithWeekday, the parentheses of the weekday are half-width so that it fits in
 * a badge. An unreadable string is returned as is.
 */
export function formatShortDateWithWeekday(key: string): string {
  const day = dayOfWeek(key)
  if (day === null) return key
  return `${formatDateSlash(key)}(${WEEKDAY_LABELS[day]})`
}

/** Turns 'YYYY-MM' into '2026/09' (for month headings). Returned as is when the shape differs */
export function formatMonthSlash(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  return m ? `${m[1]}/${m[2]}` : month
}

/**
 * Event badge text of vendor news. "見学会 2026/09/12(土)" (Open house, Sat; single day) /
 * "見学会 2026/09/12(土)〜2026/09/13(日)" (Sat to Sun; multiple days). Without eventKind
 * or eventStart it is not treated as an event (null).
 */
export function formatEventBadge(
  eventKind: string | null,
  eventStart: string | null,
  eventEnd: string | null,
): string | null {
  if (!eventKind || !eventStart) return null
  const start = formatShortDateWithWeekday(eventStart)
  if (!eventEnd || eventEnd === eventStart) return `${eventKind} ${start}`
  return `${eventKind} ${start}〜${formatShortDateWithWeekday(eventEnd)}`
}

/**
 * Groups an already ordered array by the same key, regardless of whether the date key
 * changes (unlike groupByDay it does not sort by start). It assumes the caller already
 * passes the desired order (e.g. newest first for the home feed). The order within a day
 * also keeps the order of items as is.
 * The implementation used by groupFeedByDay in feed.ts (the feed) (vendor news moved to
 * NewsAgenda / groupNewsByDate when it became an AgendaView. NewsAgenda holds the date
 * headings).
 */
export function groupByDayKeepOrder<T>(
  items: readonly T[],
  dayKey: (item: T) => string,
): { day: string; items: T[] }[] {
  const order: string[] = []
  const byDay = new Map<string, T[]>()
  for (const item of items) {
    const key = dayKey(item)
    const list = byDay.get(key)
    if (list) list.push(item)
    else {
      order.push(key)
      byDay.set(key, [item])
    }
  }
  return order.map((day) => ({ day, items: byDay.get(day)! }))
}

export function composeStartsAt(date: string, time: string | null): string {
  return time ? `${date}T${time}:00+09:00` : date
}

export function splitStartsAt(startsAt: string): { date: string; time: string | null } {
  const date = dateKey(startsAt)
  const time = startsAt.length > 10 ? startsAt.slice(11, 16) : null
  return { date, time }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
}

/** Returns 'YYYY-MM-DD' plus days days as 'YYYY-MM-DD' (negative numbers allowed) */
export function addDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day + days))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`
}

export function monthKeys(year: number, month1to12: number): string[] {
  const n = daysInMonth(year, month1to12)
  const keys: string[] = []
  for (let d = 1; d <= n; d += 1) keys.push(`${year}-${pad(month1to12)}-${pad(d)}`)
  return keys
}

/** All-day ('YYYY-MM-DD') sorts before a timed one on the same day (string comparison
 * gives that) */
export function compareStartsAt(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function groupByDay<T extends { startsAt: string }>(items: readonly T[]): Map<string, T[]> {
  const sorted = [...items].sort((a, b) => compareStartsAt(a.startsAt, b.startsAt))
  const map = new Map<string, T[]>()
  for (const item of sorted) {
    const key = dateKey(item.startsAt)
    const list = map.get(key)
    if (list) list.push(item)
    else map.set(key, [item])
  }
  return map
}

export function formatEventTime(e: {
  startsAt: string
  endsAt: string | null
  allDay: boolean
}): string {
  if (e.allDay) return '終日'
  const start = splitStartsAt(e.startsAt).time ?? ''
  const end = e.endsAt ? splitStartsAt(e.endsAt).time : null
  return end ? `${start}–${end}` : start
}
