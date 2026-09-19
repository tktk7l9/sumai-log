/**
 * お知らせのドロワーに出す「行く」ボタンの状態（所有者の要望、2026-09-20）。
 * 日程を判定できたお知らせで、まだ終わっていないものだけに「9/27(土)に行く」を出す。
 * 日程が無ければ出さない（押してからのエラーを無くす）。終わったものは「終了」と示す。
 */

import { formatShortDateWithWeekday } from '../calendar'

export type PlanButtonState =
  { kind: 'view' } | { kind: 'plan'; label: string } | { kind: 'ended' } | { kind: 'none' }

export function planButtonState(
  news: { plannedEventId: string | null; eventStart: string | null; eventEnd: string | null },
  today: string,
): PlanButtonState {
  if (news.plannedEventId) return { kind: 'view' }
  if (!news.eventStart) return { kind: 'none' }
  const last = news.eventEnd ?? news.eventStart
  if (last < today) return { kind: 'ended' }
  return { kind: 'plan', label: `${formatShortDateWithWeekday(news.eventStart)}に行く` }
}
