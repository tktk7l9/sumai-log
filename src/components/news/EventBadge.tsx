import { Badge } from '@mantine/core'

import { formatEventBadge } from '../../lib/calendar'

/**
 * A badge shown only when the vendor news is judged to be an event (open house,
 * consultation, etc.). "見学会 2026/09/12(土)" (Open house, Sat; single day) /
 * "見学会 2026/09/12(土)〜2026/09/13(日)" (Sat to Sun; multiple days).
 * Renders nothing when it is not an event (the caller does not need to branch on isEvent).
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
