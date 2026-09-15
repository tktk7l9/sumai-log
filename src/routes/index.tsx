import { Stack } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'

import { PageShell } from '../components/PageShell'
import { PendingVisits } from '../components/home/PendingVisits'
import { UpcomingEvents } from '../components/home/UpcomingEvents'
import { listHomeEvents } from '../server/events'

export const Route = createFileRoute('/')({ component: Home, loader: () => listHomeEvents() })

function Home() {
  const { upcoming, pending } = Route.useLoaderData()
  return (
    <PageShell title="住まいログ" description="二人の家探しの記録">
      <Stack gap="lg">
        <PendingVisits events={pending} />
        <UpcomingEvents events={upcoming} />
      </Stack>
    </PageShell>
  )
}
