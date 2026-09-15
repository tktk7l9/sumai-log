import { createFileRoute } from '@tanstack/react-router'

import { EmptyState } from '../components/EmptyState'
import { PageShell } from '../components/PageShell'

export const Route = createFileRoute('/settings')({ component: Page })

function Page() {
  return (
    <PageShell title="設定">
      <EmptyState title="準備中" description="次のタスクで実装します。" />
    </PageShell>
  )
}
