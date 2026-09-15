/**
 * 日本の祝日と、行政の期限が翌開庁日にずれる計算。
 *
 * 納期限は「末日」でも、その日が土日祝なら実際の期限は翌開庁日になる。
 * 台帳が表示する期限がここでずれると納付を落とすので、暦を持たずに算出する。
 *
 * 対象は **2023年以降**。祝日法は過去に何度も変わっており（山の日の新設、
 * 五輪特例の移動、天皇誕生日の変更など）、過去の年を正しく再現しようとすると
 * 特例の塊になる。この台帳が扱うのは今年以降の期限なので現行法のみを実装する。
 */

/**
 * 最小限の日付ユーティリティ（kousan-admin の src/lib/schedule.ts から必要な分だけ移植）。
 * sumai-log には年次スケジュール機能が無いため schedule.ts 全体は持ち込まず、
 * 祝日計算に要る parseIsoDate / toIsoDate / daysInMonth だけをここに閉じ込める。
 */

type ParsedDate = { year: number; month: number; day: number }

/** うるう年か。 */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** その年その月の日数。 */
function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/** 実在しない日を月末に丸める。 */
function clampDayToMonth(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month))
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 年・月・日から 'YYYY-MM-DD' を作る（実在しない日は月末に丸める）。 */
function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(clampDayToMonth(year, month, day))}`
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** 'YYYY-MM-DD' を分解する。書式が違えば null。 */
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

/** 曜日。0=日曜。 */
export function dayOfWeek(iso: string): number | null {
  const parsed = parseIsoDate(iso)
  if (!parsed) return null
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay()
}

export function isWeekend(iso: string): boolean {
  const day = dayOfWeek(iso)
  return day === 0 || day === 6
}

/** その月の n 番目の月曜日（ハッピーマンデー用）。 */
export function nthMondayOf(year: number, month: number, nth: number): number {
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  // 1日が月曜(1)なら1日が第1月曜。それ以外は次の月曜まで進める。
  const firstMonday = 1 + ((8 - firstDay) % 7)
  return firstMonday + (nth - 1) * 7
}

/**
 * 春分の日・秋分の日。
 * 国立天文台の官報公表値に一致する近似式（1980〜2099 で有効）。
 */
export function equinoxDay(year: number, season: 'spring' | 'autumn'): number {
  const base = season === 'spring' ? 20.8431 : 23.2488
  return Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
}

/** 祝日法の本来の祝日（振替休日・国民の休日を含まない）。 */
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
 * 振替休日と国民の休日を足した、その年の祝日一覧。
 *
 * 振替休日: 祝日が日曜なら、その後の最初の平日が休日になる。
 * 国民の休日: 祝日に挟まれた平日は休日になる（例 敬老の日と秋分の日に挟まれる日）。
 */
export function holidaysOfYear(year: number): Map<string, string> {
  const holidays = new Map(statutoryHolidays(year))

  // 振替休日
  for (const iso of [...holidays.keys()].sort()) {
    if (dayOfWeek(iso) !== 0) continue
    let candidate = shiftDate(iso, 1)
    while (holidays.has(candidate)) candidate = shiftDate(candidate, 1)
    holidays.set(candidate, '振替休日')
  }

  // 国民の休日（前後が祝日で、自身は祝日でも日曜でもない日）
  for (const iso of [...holidays.keys()].sort()) {
    const dayAfterNext = shiftDate(iso, 2)
    const between = shiftDate(iso, 1)
    if (!holidays.has(dayAfterNext)) continue
    if (holidays.has(between)) continue
    // 挟まれた日が日曜なら国民の休日にはならない（祝日法の要件）。
    // 現行の祝日の組み合わせでは 2023〜2099 のどの年でも発生しないことを確認済みだが、
    // 法改正で祝日が増えたときに誤って国民の休日を作らないよう残しておく。
    /* v8 ignore next */
    if (dayOfWeek(between) === 0) continue
    holidays.set(between, '国民の休日')
  }

  return holidays
}

/** その日が祝日なら名称、そうでなければ null。 */
export function holidayName(iso: string): string | null {
  const parsed = parseIsoDate(iso)
  if (!parsed) return null
  return holidaysOfYear(parsed.year).get(iso) ?? null
}

export function isHoliday(iso: string): boolean {
  return holidayName(iso) !== null
}

/** 行政の窓口が開いている日か（土日祝でない）。 */
export function isBusinessDay(iso: string): boolean {
  const parsed = parseIsoDate(iso)
  if (!parsed) return false
  return !isWeekend(iso) && !isHoliday(iso)
}

/**
 * その日が休みなら翌開庁日まで送る。開庁日ならそのまま返す。
 * 不正な日付はそのまま返す（呼び出し側で表示を壊さない）。
 */
export function nextBusinessDay(iso: string): string {
  if (!parseIsoDate(iso)) return iso
  let candidate = iso
  // 年末年始でも 10 日以上連続で閉まることはない
  for (let i = 0; i < 10 && !isBusinessDay(candidate); i += 1) {
    candidate = shiftDate(candidate, 1)
  }
  return candidate
}

/** 休みである理由（表示用）。開庁日なら null。 */
export function nonBusinessDayReason(iso: string): string | null {
  if (!parseIsoDate(iso)) return null
  const name = holidayName(iso)
  if (name) return name
  const day = dayOfWeek(iso)
  if (day === 0) return '日曜'
  if (day === 6) return '土曜'
  return null
}

/** 月末（「末日が納期限」の指定を実際の日付にする）。 */
export function lastDayOfMonth(year: number, month: number): number {
  return daysInMonth(year, month)
}

export type ObservedDueDate = {
  /** 実際に守るべき期限 */
  observedOn: string
  /** ずれた理由（ずれていなければ null） */
  reason: string | null
}

/**
 * 規則上の期日から、実際の期限を求める。
 *
 * 規則上の日はそのまま記録のキーに使い、表示と残り日数はこちらを使う。
 * 例: 固都税の第1期は「5月末日」だが 2026 年の 5/31 は日曜なので実際は 6/1。
 */
export function resolveObservedDueDate(dueOn: string, observeHolidays: boolean): ObservedDueDate {
  if (!observeHolidays) return { observedOn: dueOn, reason: null }

  const observedOn = nextBusinessDay(dueOn)
  if (observedOn === dueOn) return { observedOn, reason: null }

  return { observedOn, reason: nonBusinessDayReason(dueOn) }
}
