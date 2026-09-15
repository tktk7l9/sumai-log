import { Badge } from '@mantine/core'

import { STATUS_COLOR, STATUS_LABEL, type CandidateStatus } from '../../lib/status'

export function StatusBadge({ status }: { status: CandidateStatus }) {
  return (
    <Badge color={STATUS_COLOR[status]} variant={status === 'dropped' ? 'outline' : 'light'}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
