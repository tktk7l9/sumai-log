import { Badge } from '@mantine/core'

import { STATUS_COLOR, STATUS_LABEL, type CandidateStatus } from '../../lib/status'

export function StatusBadge({ status }: { status: CandidateStatus }) {
  return (
    <Badge
      color={STATUS_COLOR[status]}
      variant={status === 'dropped' ? 'outline' : 'light'}
      // Do not squash the badge even when the name is long (it was cut off as "気に…")
      style={{ flexShrink: 0 }}
    >
      {STATUS_LABEL[status]}
    </Badge>
  )
}
