import { Badge } from '@mantine/core'

/**
 * "New" on news and videos from the last 7 days, and the countdown ("今日" / "明日" / "明後日" /
 * "あとN日") on events of the next 7 days (src/lib/freshness.ts). A word, not only a colour
 * (SHIG 96, 70)
 */
export function NewBadge() {
  return (
    <Badge size="xs" variant="filled" color="orange" tt="none">
      New
    </Badge>
  )
}

export function UpcomingBadge({ label, size = 'xs' }: { label: string; size?: 'xs' | 'sm' }) {
  return (
    <Badge size={size} variant="light" color="blue">
      {label}
    </Badge>
  )
}
