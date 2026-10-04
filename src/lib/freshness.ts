import { addDays } from './calendar'
import { toJstDateKey } from './jst'

/**
 * The "New" and "今週" (this week) tags: a news item or video from the last 7 days, and an
 * event in the next 7 days. Days are JST dates; `todayKey` comes from the server so that the
 * page and its hydration agree.
 */
export const FRESH_DAYS = 7

/** Published or added today or in the 6 days before. Takes 'YYYY-MM-DD' or an ISO time */
export function isRecent(value: string | null, todayKey: string): boolean {
  if (!value) return false
  const key = toJstDateKey(value)
  return key <= todayKey && key > addDays(todayKey, -FRESH_DAYS)
}

/** Starts today or in the 6 days after. Takes 'YYYY-MM-DD' or a local 'YYYY-MM-DDTHH:mm' */
export function isWithinWeek(startKey: string, todayKey: string): boolean {
  const key = startKey.slice(0, 10)
  return key >= todayKey && key < addDays(todayKey, FRESH_DAYS)
}
