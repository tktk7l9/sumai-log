import { Text } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'

import { PageShell } from '../components/PageShell'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <PageShell title="住まいログ" description="二人の家探しの記録">
      <Text c="dimmed">まだ何もありません。「候補」から業者や物件を登録してください。</Text>
    </PageShell>
  )
}
