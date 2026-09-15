import { SegmentedControl, SimpleGrid, Stack } from '@mantine/core'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'

import { EmptyState } from '../components/EmptyState'
import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { VisitCard } from '../components/visits/VisitCard'
import { VisitForm } from '../components/visits/VisitForm'
import { dateKey } from '../lib/calendar'
import { UUID_SHAPE } from '../lib/ids'
import { listVisits, visitFormOptions } from '../server/visits'

const search = z.object({
  tab: z.enum(['visits', 'videos']).default('visits'),
  // 予定から「記録を書く」で来たとき: その予定を初期値にしてフォームを開く
  fromEvent: z.string().regex(UUID_SHAPE).optional(),
})

export const Route = createFileRoute('/records')({
  component: Page,
  validateSearch: (s) => search.parse(s),
  loader: async () => {
    const [visits, options] = await Promise.all([listVisits(), visitFormOptions()])
    return { visits, options }
  },
})

function Page() {
  const { visits, options } = Route.useLoaderData()
  const { tab, fromEvent } = Route.useSearch()
  const navigate = useNavigate({ from: '/records' })
  const [opened, setOpened] = useState(fromEvent !== undefined)
  const fromEventRow = fromEvent ? options.events.find((e) => e.id === fromEvent) : undefined

  function close() {
    setOpened(false)
    if (fromEvent) navigate({ search: (s) => ({ ...s, fromEvent: undefined }) })
  }

  return (
    <PageShell title="記録">
      <Stack gap="md">
        <SegmentedControl
          fullWidth
          value={tab}
          onChange={(v) => navigate({ search: (s) => ({ ...s, tab: v as 'visits' | 'videos' }) })}
          data={[
            { value: 'visits', label: `見学記録 ${visits.length}` },
            { value: 'videos', label: 'YouTube' },
          ]}
        />
        {tab === 'videos' ? (
          <EmptyState title="準備中" description="YouTube のメモは次の段階で追加します。" />
        ) : visits.length === 0 ? (
          <EmptyState
            title="見学記録がありません"
            description="右下の追加から書けます。予定タブの「記録を書く」からも開けます。"
          />
        ) : (
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {visits.map((v) => (
              <VisitCard key={v.id} visit={v} />
            ))}
          </SimpleGrid>
        )}
      </Stack>
      {tab === 'visits' ? <Fab label="記録を書く" onClick={() => setOpened(true)} /> : null}
      <FormDrawer opened={opened} onClose={close} title="見学記録を書く">
        <VisitForm
          visit={null}
          options={options}
          defaults={
            fromEventRow
              ? {
                  eventId: fromEventRow.id,
                  placeId: fromEventRow.placeId ?? null,
                  vendorId: fromEventRow.vendorId ?? null,
                  propertyId: fromEventRow.propertyId ?? null,
                  visitedOn: dateKey(fromEventRow.startsAt),
                }
              : undefined
          }
          onSaved={(id) => {
            close()
            navigate({ to: '/records/visits/$id', params: { id } })
          }}
        />
      </FormDrawer>
    </PageShell>
  )
}
