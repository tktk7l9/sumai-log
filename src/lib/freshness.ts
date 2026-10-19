import { addDays } from './calendar'
import { toJstDateKey } from './jst'

/**
 * The "New" tag and the countdown tag of the home agenda: a news item or video from the last
 * 7 days is "New", and an event within the next 7 days is tagged with how soon it is ("今日"
 * (today), "明日" (tomorrow), "明後日" (the day after), then "あと3日" … "あと7日" (3 … 7 days
 * left); owner's request, 2026-10-19, replacing a flat "今週" (this week)). Days are JST dates;
 * `todayKey` comes from the server so that the page and its hydration agree.
 */
export const FRESH_DAYS = 7

/** Published or added today or in the 6 days before. Takes 'YYYY-MM-DD' or an ISO time */
export function isRecent(value: string | null, todayKey: string): boolean {
  if (!value) return false
  const key = toJstDateKey(value)
  return key <= todayKey && key > addDays(todayKey, -FRESH_DAYS)
}

const MS_PER_DAY = 86_400_000

function utcMs(key: string): number {
  const [year, month, day] = key.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/**
 * Calendar days from `todayKey` to the start of `startsAt` (negative when it has started
 * already). Takes 'YYYY-MM-DD' or a local 'YYYY-MM-DDTHH:mm'; the time of day does not count
 */
export function daysUntil(startsAt: string, todayKey: string): number {
  return Math.round((utcMs(startsAt.slice(0, 10)) - utcMs(todayKey)) / MS_PER_DAY)
}

/**
 * The countdown tag of an event: "今日" / "明日" / "明後日" / "あとN日" for an event that starts
 * today or within the next FRESH_DAYS days, null for anything earlier or later
 */
export function upcomingLabel(startsAt: string, todayKey: string): string | null {
  const days = daysUntil(startsAt, todayKey)
  if (days < 0 || days > FRESH_DAYS) return null
  if (days === 0) return '今日'
  if (days === 1) return '明日'
  if (days === 2) return '明後日'
  return `あと${days}日`
}
