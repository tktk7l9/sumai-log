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

/** 'YYYY-MM-DD' を '2026-09-20（日）' に直す。読めない文字列はそのまま返す。 */
export function formatDateWithWeekday(key: string): string {
  const day = dayOfWeek(key)
  if (day === null) return key
  return `${key}（${WEEKDAY_LABELS[day]}）`
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
