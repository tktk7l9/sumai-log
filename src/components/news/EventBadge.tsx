import { Badge } from '@mantine/core'

import { formatEventBadge } from '../../lib/calendar'

/**
 * 業者のお知らせがイベント（見学会・相談会など）と判定されているときだけ出す
 * バッジ。「見学会 2026/09/12(土)」（単日）／「見学会 2026/09/12(土)〜2026/09/13(日)」（複数日）。
 * イベントでなければ何も描画しない（呼び出し側で isEvent を分岐しなくてよい）。
 */
export function EventBadge({
  eventKind,
  eventStart,
  eventEnd,
}: {
  eventKind: string | null
  eventStart: string | null
  eventEnd: string | null
}) {
  const label = formatEventBadge(eventKind, eventStart, eventEnd)
  if (!label) return null
  return (
    <Badge color="gray" variant="light">
      {label}
    </Badge>
  )
}
