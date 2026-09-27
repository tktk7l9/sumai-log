/**
 * Extracts the kind and dates of an event from the body of a vendor news item (title + summary
 * joined by the caller) (design.md §3). When there is no kind word at all, or not a single
 * real date can be found, it is not an event (null).
 *
 * Date expressions are resolved by filling in the year of the published date (when the body
 * has no explicit year). The year-crossing decision is split out into `inferYear`. Found dates
 * are validated as month 1-12 and a day on the real calendar (leap years considered), and
 * non-existent ones are dropped individually (the event still holds if another real day
 * exists).
 *
 * Supported date formats (see the comments of each section for details):
 *   - Kanji: `M月D日` (`YYYY年` is optional), and a list / range of standalone `D日` that
 *     follows right after (`・18日` `〜23日(月祝)` etc.; weekday / holiday notes are ignored)
 *   - Slash: `M/D` alone, `M/D-/D` (end in the same month), `M/D-M/D` (end that may cross
 *     months), `M/D〜M/D` / `M/D～D` (range with wave dash / full-width tilde),
 *     `M/D.D` / `M/D・D` / `M/D、D` / `M/D,D` (list of days separated by `.` `・` `、` `,`.
 *     It can repeat, as in `8/22.23.24`. Each item must be a real day greater than the
 *     previous day, and reading the list stops at the point where that no longer holds
 *     -- a trade-off to avoid confusion with decimal notation [`1.5` `0.5割`])
 */

import { pad } from './text'

export type EventKindLabel =
  '完成見学会' | '構造見学会' | '見学会' | '相談会' | 'セミナー' | 'イベント'

/**
 * Priority of the kind words. The first match wins (order matters because "見学会" is also a
 * substring of "完成見学会" etc.).
 */
function detectKind(text: string): EventKindLabel | null {
  if (text.includes('完成見学会')) return '完成見学会'
  if (text.includes('構造見学会')) return '構造見学会'
  if (text.includes('見学会') || text.includes('オープンハウス')) return '見学会'
  if (text.includes('相談会')) return '相談会'
  if (text.includes('セミナー')) return 'セミナー'
  if (text.includes('イベント')) return 'イベント'
  return null
}

/**
 * Infers the year from the month of a date, relative to the published date
 * (`publishedOn` = 'YYYY-MM-DD'). A month **2 or more months before** the published month
 * (`month < published month - 1`) is taken as an event of the next year.
 * Anything else (up to 1 month before the published month, the same month, later months) is
 * the same year as the published date.
 */
export function inferYear(month: number, publishedOn: string): number {
  const postYear = Number(publishedOn.slice(0, 4))
  const postMonth = Number(publishedOn.slice(5, 7))
  return month < postMonth - 1 ? postYear + 1 : postYear
}

type FoundDate = { year: number; month: number; day: number }

function toIso(date: FoundDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/**
 * Whether the month is 1-12 and the day exists in that year and month (leap years considered).
 * The final filter that rejects days such as "1月32日" and "2月30日", which match the shape of
 * the regular expression but are not on the calendar.
 */
function isRealDate(date: FoundDate): boolean {
  return (
    date.month >= 1 &&
    date.month <= 12 &&
    date.day >= 1 &&
    date.day <= daysInMonth(date.year, date.month)
  )
}

// "YYYY年" is optional. "M月D日" is required (weekday / holiday notes such as `(土)` can be
// ignored. They contain no digits, so they do not affect the later scan).
const KANJI_DATE = /(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/g
// A standalone "D日" that is not part of "M月D日" (continuation of a list / range: `・18日`
// `〜23日` etc.).
const BARE_DAY = /(\d{1,2})日/g

type KanjiSpan = { start: number; end: number; year: number; month: number }

/**
 * Picks up "M月D日" (an explicit year is allowed too) and the list / range of "D日" that
 * follows it (`・18日` `〜23日(月祝)` etc.; weekday / holiday notes are ignored).
 * A standalone "D日" is taken as the same month and year as the preceding "M月D日", and is
 * dropped when there is none before it.
 */
function findKanjiDates(text: string, publishedOn: string): FoundDate[] {
  const dates: FoundDate[] = []
  const spans: KanjiSpan[] = []

  for (const match of text.matchAll(KANJI_DATE)) {
    // A matchAll match always has an index (it is optional only in the type definition)
    const start = match.index as number
    const month = Number(match[2])
    const year = match[1] !== undefined ? Number(match[1]) : inferYear(month, publishedOn)
    spans.push({ start, end: start + match[0].length, year, month })
    dates.push({ year, month, day: Number(match[3]) })
  }

  for (const match of text.matchAll(BARE_DAY)) {
    const start = match.index as number
    // Do not double count the day part of a "M月D日" already picked up by KANJI_DATE
    if (spans.some((span) => start >= span.start && start < span.end)) continue

    // The preceding "M月D日" whose month is reused (without one this "D日" has no clue, so drop it)
    let governing: KanjiSpan | undefined
    for (let i = spans.length - 1; i >= 0; i--) {
      if (spans[i].start < start) {
        governing = spans[i]
        break
      }
    }
    if (!governing) continue

    dates.push({ year: governing.year, month: governing.month, day: Number(match[1]) })
  }

  return dates
}

// After "M/D", optionally allows a range that ends in the same month (`-/D` `～D`) or runs to
// another month (`-M/D` `〜M/D`).
const SLASH_RANGE =
  /(\d{1,2})\/(\d{1,2})(?:[-〜～](?:(\d{1,2})\/(\d{1,2})|\/(\d{1,2})|(\d{1,2})))?/g

/**
 * A lone "M/D" with neither a range marker (`-` `〜` `～`) nor a weekday note can be a false
 * positive for fraction notation ("参加費は通常の1/2です", "先着1/2程度" etc.). When one of
 * these words comes right before or right after, it is taken as a fraction and not as a date.
 *
 * There is a trade-off: false detection cannot be removed completely. For example, a wording
 * such as "見学会の9/12開催", which really means a date and has "の" right before it, cannot
 * be told apart from a fraction with this simple word list, and the date is dropped. When it
 * is part of a range (`7/6-/7` etc.) or a weekday note such as `(土)` follows, this check is
 * not applied and it is always treated as a date.
 */
const FRACTION_TRAILING_WORDS = ['程度', '以下', '以上', '割', '%', '名', '円', 'の', '倍']
const FRACTION_LEADING_WORDS = ['の', 'は', '約', '先着']

function looksLikeFraction(text: string, start: number, end: number): boolean {
  const after = text.slice(end)
  const before = text.slice(0, start)
  return (
    FRACTION_TRAILING_WORDS.some((word) => after.startsWith(word)) ||
    FRACTION_LEADING_WORDS.some((word) => before.endsWith(word))
  )
}

// One item of the list of days that continues right after "M/D" (a 1-2 digit day following
// one of `.` `・` `、` `,`). So as not to cut out part of a number with 3 or more digits
// (`.234` etc.), it does not match when another digit follows right after (`(?!\d)`).
const SLASH_DAY_LIST_ITEM = /^[.・、,](\d{1,2})(?!\d)/

/**
 * Reads as much of the list of days starting at `cursor` as it can. Each item must be a real
 * day (same year and month) greater than the previous day; otherwise it stops there
 * (a trade-off so that decimal notation such as `1.5` `0.5割` is not mistaken for a list.
 * For example, in `7/22.5割` 5 is smaller than 22, so it is not a list and stays a lone
 * 7/22). The returned `day` is the last day that was read (null when no list item was read).
 */
function readDayList(
  text: string,
  cursor: number,
  year: number,
  month: number,
  startDay: number,
): number | null {
  let lastDay: number | null = null
  let pos = cursor
  let prevDay = startDay

  for (;;) {
    const match = SLASH_DAY_LIST_ITEM.exec(text.slice(pos))
    if (!match) break
    const day = Number(match[1])
    if (day <= prevDay || !isRealDate({ year, month, day })) break
    lastDay = day
    prevDay = day
    pos += match[0].length
  }

  return lastDay
}

/** Picks up "M/D", "M/D-/D", "M/D-M/D", "M/D〜M/D", "M/D～D", "M/D.D", "M/D・D" etc. */
function findSlashDates(text: string, publishedOn: string): FoundDate[] {
  const dates: FoundDate[] = []

  for (const match of text.matchAll(SLASH_RANGE)) {
    const startMonth = Number(match[1])
    const startDay = Number(match[2])
    const hasRange = match[3] !== undefined || match[5] !== undefined || match[6] !== undefined
    const start = match.index as number
    const end = start + match[0].length
    const year = inferYear(startMonth, publishedOn)

    // Without a range marker (`-` `〜` `～`), try the list of days that follows right after
    // (`8/22.23` etc.). It does not coexist with the existing range forms (when there is a
    // range, the list is not tried).
    const listEndDay = hasRange ? null : readDayList(text, end, year, startMonth, startDay)

    if (!hasRange && listEndDay === null && looksLikeFraction(text, start, end)) continue

    dates.push({ year, month: startMonth, day: startDay })

    if (match[3] !== undefined) {
      // M/D-M/D (end that may cross months)
      const endMonth = Number(match[3])
      dates.push({
        year: inferYear(endMonth, publishedOn),
        month: endMonth,
        day: Number(match[4]),
      })
    } else if (match[5] !== undefined) {
      // M/D-/D (end in the same month)
      dates.push({ year, month: startMonth, day: Number(match[5]) })
    } else if (match[6] !== undefined) {
      // M/D～D (end in the same month)
      dates.push({ year, month: startMonth, day: Number(match[6]) })
    } else if (listEndDay !== null) {
      // M/D.D, M/D・D etc. (list. The last day that was read becomes the end)
      dates.push({ year, month: startMonth, day: listEndDay })
    }
  }

  return dates
}

/**
 * A range longer than this many days is not taken as "one event" and only the start date is
 * kept (see MAX_RANGE_DAYS).
 */
const MAX_RANGE_DAYS = 14

/**
 * Difference in days between two 'YYYY-MM-DD' (end − start; negative when end is earlier).
 * Counts leap years correctly through UTC totals.
 */
function daysBetween(startIso: string, endIso: string): number {
  const toUtcMs = (iso: string) =>
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
  return Math.round((toUtcMs(endIso) - toUtcMs(startIso)) / 86_400_000)
}

/**
 * Extracts the kind and dates of an event from title + summary (`text` joined by the caller).
 * null when there is no kind word at all ("完成見学会" / "構造見学会" / "見学会" (includes
 * "お住まい見学会" and "オープンハウス") / "相談会" / "セミナー" / "イベント"). null when
 * not a single real date expression can be found (non-existent days such as 1/32 or 2/30, and
 * M/D taken as fraction notation, are dropped individually). When several days are found the
 * smallest is start and the largest is end (with one day both are the same).
 *
 * However, when start to end exceeds MAX_RANGE_DAYS (14 days), end is aligned to start
 * (it becomes a one-day event). When the body mixes in dates unrelated to the event date
 * (a reception period etc.), as in "8月1日より受付開始。見学会は9月12日", deciding the range
 * by min/max alone gives a very long period crossing months: the calendar shows a gray bar
 * months long, or "行く" (Go) creates an event on the reception start date (the minimum).
 * When there is no confidence that it is a range, falling back to a single day is safer.
 */
export function extractEvent(
  text: string,
  publishedOn: string,
): { start: string; end: string; kind: EventKindLabel } | null {
  const kind = detectKind(text)
  if (!kind) return null

  const dates = [...findKanjiDates(text, publishedOn), ...findSlashDates(text, publishedOn)].filter(
    isRealDate,
  )
  if (dates.length === 0) return null

  const isoDates = dates.map(toIso)
  const start = isoDates.reduce((a, b) => (a < b ? a : b))
  const rawEnd = isoDates.reduce((a, b) => (a > b ? a : b))
  const end = daysBetween(start, rawEnd) > MAX_RANGE_DAYS ? start : rawEnd

  return { start, end, kind }
}
