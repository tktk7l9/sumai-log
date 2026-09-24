import { dayOfWeek } from './holidays'

/**
 * 予定の日時表現。DB には TEXT で、終日は 'YYYY-MM-DD'、時刻ありは
 * 'YYYY-MM-DDTHH:MM:00+09:00'（日本時間のオフセットを明示）で入る。
 * 日付キーは先頭 10 文字。Date オブジェクトに変換しない（タイムゾーンで壊れる）。
 */

export function dateKey(startsAt: string): string {
  return startsAt.slice(0, 10)
}

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const

/**
 * 日付の表示は全て `/` 区切りに統一する（所有者の要望）。'YYYY-MM-DD' を
 * 'YYYY/MM/DD' に直すだけの単一の実装。ハイフン区切りでない・形が合わない文字列は
 * そのまま返す（他の formatXxx と同じフォールバック方針）。dateKey/検索パラメータ/
 * DB の値は触らない（あくまで表示のときにこれを通す）。
 */
export function formatDateSlash(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return key
  return `${m[1]}/${m[2]}/${m[3]}`
}

/** 'YYYY-MM-DD' を '2026/09/20（日）' に直す。読めない文字列はそのまま返す。 */
export function formatDateWithWeekday(key: string): string {
  const day = dayOfWeek(key)
  if (day === null) return key
  return `${formatDateSlash(key)}（${WEEKDAY_LABELS[day]}）`
}

/**
 * 'YYYY-MM-DD' を '2026/09/12(土)' に直す（EventBadge・「行く」ボタン用）。日付は全て
 * YYYY/MM/DD にそろえる（所有者の要望、2026-09-23）。formatDateWithWeekday と違い、バッジに
 * 収まるよう曜日の括弧を半角にする。読めない文字列はそのまま返す。
 */
export function formatShortDateWithWeekday(key: string): string {
  const day = dayOfWeek(key)
  if (day === null) return key
  return `${formatDateSlash(key)}(${WEEKDAY_LABELS[day]})`
}

/** 'YYYY-MM' を '2026/09' に直す（月の見出し用）。形が合わなければそのまま返す */
export function formatMonthSlash(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  return m ? `${m[1]}/${m[2]}` : month
}

/**
 * 業者のお知らせのイベントバッジ文言。「見学会 2026/09/12(土)」（単日）／
 * 「見学会 2026/09/12(土)〜2026/09/13(日)」（複数日）。eventKind か eventStart が無ければ
 * イベントとして扱わない（null）。
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
 * 既に並んでいる配列を、日付キーが変わるかどうかに関わらず同じキーでまとめる
 * （groupByDay と違って開始順には並べ替えない）。呼び出し側が既に望む順で渡す前提
 * （例: ホームのフィードの新しい順）。日内の順序も items の並びをそのまま保つ。
 * feed.ts の groupFeedByDay（フィード）が使う実装（お知らせは AgendaView 化に伴い
 * NewsAgenda / groupNewsByDate に移った。日付見出しは NewsAgenda が持つ）。
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

/** 'YYYY-MM-DD' に days 日足した 'YYYY-MM-DD' を返す（負数も可） */
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

/** 終日('YYYY-MM-DD')は同じ日の時刻ありより前に並ぶ（文字列比較でそうなる） */
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
