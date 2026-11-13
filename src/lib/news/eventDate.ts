/**
 * Extracts the kind and dates of an event from the body of a vendor news item (title + summary
 * joined by the caller) (design.md §3). When there is no kind word at all, or not a single
 * real date can be found, it is not an event (null).
 *
 * The text is read after NFKC normalisation, so full-width digits, slashes, brackets and the
 * full-width tilde are the same as their ASCII forms (`１１／１４（土）` = `11/14(土)`).
 *
 * Date expressions are resolved by filling in the year of the published date (when the body
 * has no explicit year). The year-crossing decision is split out into `inferYear`. Found dates
 * are validated as month 1-12 and a day on the real calendar (leap years considered), and
 * non-existent ones are dropped individually (the event still holds if another real day
 * exists).
 *
 * Supported date formats (see the comments of each section for details):
 *   - Kanji: `M月D日` (`YYYY年` is optional), and the standalone `D日` that continue it
 *     (`・18日` `〜23日(月祝)` `と22日`; weekday / holiday notes are ignored). A `D日` that
 *     counts days (`1日3組`, `3日間`, `3日前`) is not a day of the month
 *   - Slash: `M/D` alone (`YYYY/` is optional), `M/D-/D` (end in the same month), `M/D-M/D`
 *     (end that may cross months), `M/D〜D` (range marks: `-` `〜` `~` `–` `—` `−`), and a
 *     list of days `M/D.D` / `M/D・D` / `M/D、D` / `M/D,D` (it can repeat, as in `8/22.23.24`.
 *     Each item must be a real day greater than the previous day, and reading the list stops
 *     at the point where that no longer holds -- a trade-off to avoid confusion with decimal
 *     notation [`1.5` `0.5割`]). A weekday note may sit between the day and the mark
 *     (`11/14(土)・15(日)`, `11/14(土)〜15(日)`)
 *   - Dot with a year: `YYYY.M.D`
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
 * the same year as the published date. "1 month before" wraps at the new year: December in a
 * January post is last month, so the year before (a report on an event that just ended).
 */
export function inferYear(month: number, publishedOn: string): number {
  const postYear = Number(publishedOn.slice(0, 4))
  const postMonth = Number(publishedOn.slice(5, 7))
  if (postMonth === 1 && month === 12) return postYear - 1
  return month < postMonth - 1 ? postYear + 1 : postYear
}

export type FoundDate = { year: number; month: number; day: number }

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
 * the regular expression but are not on the calendar (htmlList.ts uses it on the digits of a
 * link as well).
 */
export function isRealDate(date: FoundDate): boolean {
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
// `〜23日` etc.). Not the tail of a longer number (`120日`).
const BARE_DAY = /(?<!\d)(\d{1,2})日/g

/** A weekday / holiday note: `(土)` `(月・祝)` `(土曜)`. No digits, so `(10:00)` is not one */
const NOTE = String.raw`(?:\s*\([^)\d]{1,6}\))?`

/**
 * What may stand between a date and the "D日" that continues it as a list or a range: the
 * note of the date before, then one joining mark (`11月21日(土)・22日`, `21日〜23日`,
 * `21日と22日`, `21日から23日`).
 */
const KANJI_JOIN = new RegExp(`^${NOTE}\\s*(?:[・、,〜~\\-–—−&と]|から|及び|および)\\s*$`)

/**
 * "D日" counts days instead of naming a day of the month when one of these follows:
 * `1日3組`, `3日間`, `2日目`, `3日前`, `8日後`, `5日以内`.
 */
const COUNT_AFTER_JOINED = /^(?:\d|間|目|前|後|以内)/
/**
 * The same for a "D日" that is not joined to the date before it, which gets less benefit of
 * the doubt: also `1日だけ`, `1日のみ`, `1日限り`, `1日中`, `3日連続`, `第3日曜`, `2日とも`,
 * `3日以上`, `3日ほど`, `3日程度`, `3日おき`, `3日ごと`, `3日分`.
 */
const COUNT_AFTER_LOOSE = /^(?:\d|間|目|前|後|以|だけ|のみ|限|中|連|曜|とも|ほど|程|おき|ごと|分)/
/** `第3日`, `全3日`, `計3日`, `約3日`, `各3日`, `毎3日` */
const COUNT_BEFORE_LOOSE = /[第全計約各毎]$/
/**
 * How far (in characters) a "D日" may be from the date it takes its month from. A join (a
 * weekday note and one mark) is far shorter than this
 */
const LOOSE_REACH = 40
/** The longest counter word above, in characters: how much text after a "D日" is looked at */
const COUNT_WORD_MAX = 4

type KanjiSpan = { start: number; end: number; year: number; month: number; day: number }

/**
 * Picks up "M月D日" (an explicit year is allowed too) and the "D日" that continue it, which
 * take the month and year of the date before them.
 *
 * A "D日" joined to the date before it by a list / range mark is a day of that month unless a
 * counter follows (`11月21日、3日前までに`). One that is not joined
 * (`11月21日(土)10:00〜17:00 / 22日(日)10:00〜15:00`) counts only when it is later in the
 * month than the date before it, in the same sentence and near it, and neither a counter nor
 * a count prefix surrounds it: "1日3組限定", "3日間限定" and "3日前までに" after a date are
 * not the 1st or the 3rd of the month (they used to move the event to a day long past, and
 * the news showed 「終了」 for an open house still two weeks away).
 * A "D日" with no "M月D日" before it has no clue for the month and is dropped.
 */
function findKanjiDates(text: string, publishedOn: string): FoundDate[] {
  const dates: FoundDate[] = []
  const spans: KanjiSpan[] = []

  for (const match of text.matchAll(KANJI_DATE)) {
    // A matchAll match always has an index (it is optional only in the type definition)
    const start = match.index as number
    const month = Number(match[2])
    const day = Number(match[3])
    const year = match[1] !== undefined ? Number(match[1]) : inferYear(month, publishedOn)
    spans.push({ start, end: start + match[0].length, year, month, day })
    dates.push({ year, month, day })
  }

  // The date each "D日" continues: the "M月D日" before it, or the "D日" accepted after that.
  // Both lists are in text order, so one pointer walks the spans (no scan per "D日")
  let previous: KanjiSpan | undefined
  let lastSpanEnd = 0
  let nextSpan = 0

  for (const match of text.matchAll(BARE_DAY)) {
    const start = match.index as number
    const end = start + match[0].length

    // The preceding "M月D日" whose month is reused (without one this "D日" has no clue, so drop it)
    while (nextSpan < spans.length && spans[nextSpan].start < start) {
      previous = spans[nextSpan]
      lastSpanEnd = previous.end
      nextSpan++
    }
    // Do not double count the day part of a "M月D日" already picked up by KANJI_DATE
    if (!previous || start < lastSpanEnd) continue

    // A "D日" further away than this is neither joined nor near. Checked before anything is
    // sliced, so the work per "D日" is bounded (a long text with one date and thousands of
    // "N日" would otherwise re-read the growing gap every time)
    if (start - previous.end > LOOSE_REACH) continue

    const day = Number(match[1])
    const between = text.slice(previous.end, start)
    const after = text.slice(end, end + COUNT_WORD_MAX)
    const joined = KANJI_JOIN.test(between)
    const isDayOfMonth = joined
      ? !COUNT_AFTER_JOINED.test(after)
      : day > previous.day &&
        !between.includes('。') &&
        !COUNT_BEFORE_LOOSE.test(between) &&
        !COUNT_AFTER_LOOSE.test(after)
    if (!isDayOfMonth) continue

    dates.push({ year: previous.year, month: previous.month, day })
    previous = { ...previous, start, end, day }
  }

  return dates
}

/** A range mark, with the note of the day before it: `-` `〜` `~` (also from `～`) `–` `—` `−` */
const RANGE_MARK = String.raw`${NOTE}\s*[-〜~–—−]\s*`

// "M/D" (an explicit `YYYY/` is allowed), optionally followed by a range that ends in the same
// month (`-/D` `〜D`) or runs to another month (`-M/D` `〜M/D`). It is not read out of the
// middle of a longer run (`2026/11/21` is not `26/11`), and the end of a range is not a time
// (`11/14〜17:00`, `11/14〜17時`).
const SLASH_RANGE = new RegExp(
  String.raw`(?<![\d/])(?:(20\d{2})/)?(\d{1,2})/(\d{1,2})(?![\d/])` +
    String.raw`(?:${RANGE_MARK}(?:(\d{1,2})/(\d{1,2})|/(\d{1,2})|(\d{1,2}))(?![\d/:時]))?`,
  'g',
)

// "YYYY.M.D". The year is required: without it `11.21` is a decimal or a version number.
const DOT_DATE = /(?<![\d.])(20\d{2})\.(\d{1,2})\.(\d{1,2})(?![\d.])/g

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
  return (
    FRACTION_TRAILING_WORDS.some((word) => text.startsWith(word, end)) ||
    FRACTION_LEADING_WORDS.some((word) => text.endsWith(word, start))
  )
}

/** What makes a number after a list mark a count, not a day: `、15組限定`, `・20名様`, `,3時間` */
const LIST_COUNTERS =
  '組|名|人|件|棟|回|時|分|円|万|千|%|:|歳|年|月|階|坪|畳|帖|社|邸|区|か月|ヶ月|カ月|m|cm|mm|㎡|kg|度|日間|日目|日前|日後'

// One item of the list of days that continues right after "M/D" (a 1-2 digit day following
// one of `.` `・` `、` `,` `&` `と`, after the weekday note of the day before:
// `11/14(土)・15(日)`). So as not to cut out part of a number with 3 or more digits (`.234`
// etc.), it does not match when another digit follows right after, nor when a counter does.
const SLASH_DAY_LIST_ITEM = new RegExp(
  String.raw`^${NOTE}\s*(?:\.|[・、,&と]\s*)(\d{1,2})(?!\d|\s*(?:${LIST_COUNTERS}))`,
)

/** Longer than any list item (note ≤ 8, mark, spaces, 2 digits, the counter looked ahead for) */
const LIST_ITEM_WINDOW = 32

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
    // A list item is a note, a mark and a day: a short window is all that is read
    const match = SLASH_DAY_LIST_ITEM.exec(text.slice(pos, pos + LIST_ITEM_WINDOW))
    if (!match) break
    const day = Number(match[1])
    if (day <= prevDay || !isRealDate({ year, month, day })) break
    lastDay = day
    prevDay = day
    pos += match[0].length
  }

  return lastDay
}

/** Picks up "M/D", "M/D-/D", "M/D-M/D", "M/D〜M/D", "M/D〜D", "M/D.D", "M/D・D" etc. */
function findSlashDates(text: string, publishedOn: string): FoundDate[] {
  const dates: FoundDate[] = []

  for (const match of text.matchAll(SLASH_RANGE)) {
    const startMonth = Number(match[2])
    const startDay = Number(match[3])
    const hasRange = match[4] !== undefined || match[6] !== undefined || match[7] !== undefined
    const start = match.index as number
    const end = start + match[0].length
    const hasYear = match[1] !== undefined
    const year = hasYear ? Number(match[1]) : inferYear(startMonth, publishedOn)

    // Without a range marker (`-` `〜` `~`), try the list of days that follows right after
    // (`8/22.23` etc.). It does not coexist with the existing range forms (when there is a
    // range, the list is not tried).
    const listEndDay = hasRange ? null : readDayList(text, end, year, startMonth, startDay)

    // With a year in front it is a date, not a fraction
    if (!hasRange && !hasYear && listEndDay === null && looksLikeFraction(text, start, end))
      continue

    dates.push({ year, month: startMonth, day: startDay })

    if (match[4] !== undefined) {
      // M/D-M/D (end that may cross months, and the year when the start names its year)
      const endMonth = Number(match[4])
      const endYear = !hasYear
        ? inferYear(endMonth, publishedOn)
        : endMonth < startMonth
          ? year + 1
          : year
      dates.push({ year: endYear, month: endMonth, day: Number(match[5]) })
    } else if (match[6] !== undefined) {
      // M/D-/D (end in the same month)
      dates.push({ year, month: startMonth, day: Number(match[6]) })
    } else if (match[7] !== undefined) {
      // M/D〜D (end in the same month)
      dates.push({ year, month: startMonth, day: Number(match[7]) })
    } else if (listEndDay !== null) {
      // M/D.D, M/D・D etc. (list. The last day that was read becomes the end)
      dates.push({ year, month: startMonth, day: listEndDay })
    }
  }

  return dates
}

/** Picks up "YYYY.M.D" */
function findDotDates(text: string): FoundDate[] {
  return [...text.matchAll(DOT_DATE)].map((match) => ({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }))
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
  // Full-width digits, slashes and brackets, the full-width tilde and half-width katakana
  // become the forms the patterns below are written in
  const normalized = text.normalize('NFKC')
  const kind = detectKind(normalized)
  if (!kind) return null

  const dates = [
    ...findKanjiDates(normalized, publishedOn),
    ...findSlashDates(normalized, publishedOn),
    ...findDotDates(normalized),
  ].filter(isRealDate)
  if (dates.length === 0) return null

  const isoDates = dates.map(toIso)
  const start = isoDates.reduce((a, b) => (a < b ? a : b))
  const rawEnd = isoDates.reduce((a, b) => (a > b ? a : b))
  const end = daysBetween(start, rawEnd) > MAX_RANGE_DAYS ? start : rawEnd

  return { start, end, kind }
}
