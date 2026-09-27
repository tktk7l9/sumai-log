/**
 * State of the "行く" (Go) button shown in the vendor news drawer (owner's request, 2026-09-20).
 * "9/27(土)に行く" (Go on 9/27 (Sat)) is shown only for vendor news whose event dates were
 * detected and that has not ended yet. Without event dates it is not shown (removes the error
 * after pressing). Ended ones are marked "終了" (Ended).
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
