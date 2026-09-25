import { Badge } from '@mantine/core'

import { STATUS_COLOR, STATUS_LABEL, type CandidateStatus } from '../../lib/status'

export function StatusBadge({ status }: { status: CandidateStatus }) {
  return (
    <Badge
      color={STATUS_COLOR[status]}
      variant={status === 'dropped' ? 'outline' : 'light'}
      // 名前が長くてもバッジ側を潰さない（「気に…」と切れていた）
      style={{ flexShrink: 0 }}
    >
      {STATUS_LABEL[status]}
    </Badge>
  )
}
