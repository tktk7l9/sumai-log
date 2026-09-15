import { createFileRoute } from '@tanstack/react-router'

import { EmptyState } from '../components/EmptyState'
import { PageShell } from '../components/PageShell'

export const Route = createFileRoute('/calendar')({ component: Page })

function Page() {
  return (
    <PageShell title="予定">
      <EmptyState title="準備中" description="次の段階で予定を登録できるようになります。" />
    </PageShell>
  )
}
