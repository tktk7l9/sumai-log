import { Badge } from '@mantine/core'

/**
 * "New" on news and videos from the last 7 days, "今週" (this week) on events in the next 7
 * days (src/lib/freshness.ts). A word, not only a colour (SHIG 96, 70)
 */
export function NewBadge() {
  return (
    <Badge size="xs" variant="filled" color="orange" tt="none">
      New
    </Badge>
  )
}

export function ThisWeekBadge({ size = 'xs' }: { size?: 'xs' | 'sm' }) {
  return (
    <Badge size={size} variant="light" color="blue">
      今週
    </Badge>
  )
}
