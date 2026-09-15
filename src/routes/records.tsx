import { createFileRoute } from '@tanstack/react-router'

import { EmptyState } from '../components/EmptyState'
import { PageShell } from '../components/PageShell'

export const Route = createFileRoute('/records')({ component: Page })

function Page() {
  return (
    <PageShell title="記録">
      <EmptyState title="準備中" description="次の段階で記録を登録できるようになります。" />
    </PageShell>
  )
}
