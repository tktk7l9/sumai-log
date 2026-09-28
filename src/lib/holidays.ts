/**
 * Japanese public holidays, and the calculation that moves an administrative deadline to the
 * next business day.
 *
 * Even when a due date is "the last day", the actual deadline is the next business day if that
 * day is a Saturday, Sunday or holiday. If the deadline the ledger shows is off here, a payment
 * gets missed, so it is computed without holding a calendar.
 *
 * Covers **2023 and later**. The holiday act has changed many times in the past (Mountain Day
 * newly added, moves under the Olympics special provisions, the change of the Emperor's
 * Birthday, etc.), and reproducing past years correctly turns into a pile of special cases.
 * This ledger handles deadlines from this year on, so only the current law is implemented.
 */

/**
 * Minimal date utilities (only what is needed, ported from src/lib/schedule.ts of kousan-admin).
 * sumai-log has no yearly schedule feature, so the whole schedule.ts is not brought in; only
 * parseIsoDate / toIsoDate / daysInMonth, which the holiday calculation needs, are confined here.
 */

type ParsedDate = { year: number; month: number; day: number }

/** Whether it is a leap year. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Number of days in that month of that year. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/** Clamps a nonexistent day to the end of the month. */
function clampDayToMonth(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month))
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Builds 'YYYY-MM-DD' from year, month and day (a nonexistent day is clamped to the end of
 * the month).
 */
function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(clampDayToMonth(year, month, day))}`
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Splits 'YYYY-MM-DD' into parts. Returns null when the format differs. */
function parseIsoDate(value: string): ParsedDate | null {
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  return { year, month, day }
}

export const HOLIDAY_RULES_VALID_FROM = 2023

/** Day of the week. 0=Sunday. */
export function dayOfWeek(iso: string): number | null {
  const parsed = parseIsoDate(iso)
  if (!parsed) return null
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay()
}

export function isWeekend(iso: string): boolean {
  const day = dayOfWeek(iso)
  return day === 0 || day === 6
}

/** The nth Monday of that month (for the Happy Monday holidays). */
export function nthMondayOf(year: number, month: number, nth: number): number {
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  // If the 1st is a Monday (1), the 1st is the 1st Monday. Otherwise advance to the next Monday.
  const firstMonday = 1 + ((8 - firstDay) % 7)
  return firstMonday + (nth - 1) * 7
}

/**
 * Vernal Equinox Day and Autumnal Equinox Day.
 * An approximation that matches the values the National Astronomical Observatory of Japan
 * publishes in the official gazette (valid for 1980-2099).
 */
export function equinoxDay(year: number, season: 'spring' | 'autumn'): number {
  const base = season === 'spring' ? 20.8431 : 23.2488
  return Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
}

/**
 * The holidays proper under the holiday act (excluding substitute holidays and citizens
 * holidays).
 */
function statutoryHolidays(year: number): Map<string, string> {
  const map = new Map<string, string>()
  const put = (month: number, day: number, name: string) => {
    map.set(toIsoDate(year, month, day), name)
  }

  put(1, 1, '元日')
  put(1, nthMondayOf(year, 1, 2), '成人の日')
  put(2, 11, '建国記念の日')
  put(2, 23, '天皇誕生日')
  put(3, equinoxDay(year, 'spring'), '春分の日')
  put(4, 29, '昭和の日')
  put(5, 3, '憲法記念日')
  put(5, 4, 'みどりの日')
  put(5, 5, 'こどもの日')
  put(7, nthMondayOf(year, 7, 3), '海の日')
  put(8, 11, '山の日')
  put(9, nthMondayOf(year, 9, 3), '敬老の日')
  put(9, equinoxDay(year, 'autumn'), '秋分の日')
  put(10, nthMondayOf(year, 10, 2), 'スポーツの日')
  put(11, 3, '文化の日')
  put(11, 23, '勤労感謝の日')

  return map
}

function shiftDate(iso: string, days: number): string {
  const parsed = parseIsoDate(iso)
  /* v8 ignore next */
  if (!parsed) return iso
  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days))
  return toIsoDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

/**
 * The list of holidays of that year, with substitute holidays and citizens holidays added.
 *
 * Substitute holiday: when a holiday is a Sunday, the first weekday after it becomes a day off.
 * Citizens holiday: a weekday between two holidays becomes a day off (e.g. the day between
 * Respect for the Aged Day and Autumnal Equinox Day).
 */
export function holidaysOfYear(year: number): Map<string, string> {
  const holidays = new Map(statutoryHolidays(year))

  // Substitute holidays
  for (const iso of [...holidays.keys()].sort()) {
    if (dayOfWeek(iso) !== 0) continue
    let candidate = shiftDate(iso, 1)
    while (holidays.has(candidate)) candidate = shiftDate(candidate, 1)
    holidays.set(candidate, '振替休日')
  }

  // Citizens holidays (a day with a holiday before and after that is itself neither a holiday
  // nor a Sunday)
  for (const iso of [...holidays.keys()].sort()) {
    const dayAfterNext = shiftDate(iso, 2)
    const between = shiftDate(iso, 1)
    if (!holidays.has(dayAfterNext)) continue
    if (holidays.has(between)) continue
    // If the day in between is a Sunday it does not become a citizens holiday (a requirement of
    // the holiday act). With the current set of holidays this is confirmed not to occur in any
    // year of 2023-2099, but it is kept so that a citizens holiday is not created by mistake
    // when a law change adds holidays.
    /* v8 ignore next */
    if (dayOfWeek(between) === 0) continue
    holidays.set(between, '国民の休日')
  }

  return holidays
}

/** The name when that day is a holiday, otherwise null. */
export function holidayName(iso: string): string | null {
  const parsed = parseIsoDate(iso)
  if (!parsed) return null
  return holidaysOfYear(parsed.year).get(iso) ?? null
}

export function isHoliday(iso: string): boolean {
  return holidayName(iso) !== null
}

/** Whether government offices are open that day (not a Saturday, Sunday or holiday). */
export function isBusinessDay(iso: string): boolean {
  const parsed = parseIsoDate(iso)
  if (!parsed) return false
  return !isWeekend(iso) && !isHoliday(iso)
}

/**
 * When that day is a day off, moves it to the next business day. A business day is returned as is.
 * An invalid date is returned as is (so the caller's display does not break).
 */
export function nextBusinessDay(iso: string): string {
  if (!parseIsoDate(iso)) return iso
  let candidate = iso
  // Even over the year-end and New Year period, offices never stay closed 10 or more days in a row
  for (let i = 0; i < 10 && !isBusinessDay(candidate); i += 1) {
    candidate = shiftDate(candidate, 1)
  }
  return candidate
}

/** The reason it is a day off (for display). Returns null for a business day. */
export function nonBusinessDayReason(iso: string): string | null {
  if (!parseIsoDate(iso)) return null
  const name = holidayName(iso)
  if (name) return name
  const day = dayOfWeek(iso)
  if (day === 0) return '日曜'
  if (day === 6) return '土曜'
  return null
}

/** End of the month (turns a "due on the last day" setting into an actual date). */
export function lastDayOfMonth(year: number, month: number): number {
  return daysInMonth(year, month)
}

export type ObservedDueDate = {
  /** The deadline that actually has to be met */
  observedOn: string
  /** The reason it moved (null when it did not move) */
  reason: string | null
}

/**
 * Derives the actual deadline from the date set by the rule.
 *
 * The date set by the rule is used as is for the record key; display and days remaining use
 * this one. Example: the 1st instalment of fixed asset tax and city planning tax is "the last
 * day of May", but 5/31 in 2026 is a Sunday, so the actual deadline is 6/1.
 */
export function resolveObservedDueDate(dueOn: string, observeHolidays: boolean): ObservedDueDate {
  if (!observeHolidays) return { observedOn: dueOn, reason: null }

  const observedOn = nextBusinessDay(dueOn)
  if (observedOn === dueOn) return { observedOn, reason: null }

  return { observedOn, reason: nonBusinessDayReason(dueOn) }
}
