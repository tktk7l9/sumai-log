import { SegmentedControl, SimpleGrid, Stack } from '@mantine/core'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'

import { EmptyState } from '../components/EmptyState'
import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { usePendingDeletes } from '../components/undoableDelete'
import { PageShell } from '../components/PageShell'
import { VideoCard } from '../components/videos/VideoCard'
import { VideoForm } from '../components/videos/VideoForm'
import { VisitCard } from '../components/visits/VisitCard'
import { VisitForm } from '../components/visits/VisitForm'
import { UUID_SHAPE } from '../lib/ids'
import { buildVisitPrefill } from '../lib/prefill'
import type { Event } from '../db/schema'
import { getEvent } from '../server/events'
import { listVideos, videoFormOptions } from '../server/videos'
import { listVisits, visitFormOptions } from '../server/visits'

const search = z.object({
  tab: z.enum(['visits', 'videos']).default('visits'),
  // When arriving from an event through "記録を書く" (Write a record): open the form with that
  // event as the initial values
  fromEvent: z.string().regex(UUID_SHAPE).optional(),
})

export const Route = createFileRoute('/records')({
  component: Page,
  validateSearch: (s) => search.parse(s),
  loaderDeps: ({ search }) => ({ fromEvent: search.fromEvent }),
  loader: async ({ deps }) => {
    const [visits, videos, options, videoOptions] = await Promise.all([
      listVisits(),
      listVideos(),
      visitFormOptions(),
      videoFormOptions(),
    ])
    // The event list of visitFormOptions is limited to a window of the last 180 days. When
    // arriving through "記録を書く" from an event outside the window, look it up individually
    // here (when absent, ignore it and keep the defaults)
    let fromEventRow: Event | undefined
    if (deps.fromEvent && !options.events.some((e) => e.id === deps.fromEvent)) {
      try {
        fromEventRow = (await getEvent({ data: { id: deps.fromEvent } })).event
      } catch {
        // 404: the event is already deleted, etc. Carry on with the defaults
      }
    }
    return { visits, videos, options, videoOptions, fromEventRow }
  },
})

function Page() {
  const {
    visits: loadedVisits,
    videos: loadedVideos,
    options,
    videoOptions,
    fromEventRow: loadedFromEventRow,
  } = Route.useLoaderData()
  // Rows whose deletion can still be undone are hidden at once
  const pendingDeletes = usePendingDeletes()
  const visits = loadedVisits.filter((v) => !pendingDeletes.has(v.id))
  const videos = loadedVideos.filter((v) => !pendingDeletes.has(v.id))
  const { tab: tabParam, fromEvent } = Route.useSearch()
  // When arriving from an event through "記録を書く", always open the visits tab even without
  // the tab parameter
  const tab = fromEvent ? 'visits' : tabParam
  const navigate = useNavigate({ from: '/records' })
  const [opened, setOpened] = useState(fromEvent !== undefined)
  const [videoFormOpened, setVideoFormOpened] = useState(false)
  const fromEventRow = fromEvent
    ? (options.events.find((e) => e.id === fromEvent) ?? loadedFromEventRow)
    : undefined

  function close() {
    setOpened(false)
    if (fromEvent) navigate({ search: (s) => ({ ...s, fromEvent: undefined }) })
  }

  return (
    <PageShell title="記録" titleHidden fab>
      <Stack gap="md">
        <SegmentedControl
          fullWidth
          aria-label="表示の切替"
          value={tab}
          onChange={(v) =>
            navigate({
              search: (s) => ({ ...s, tab: v as 'visits' | 'videos' }),
              replace: true,
            })
          }
          data={[
            { value: 'visits', label: `見学 ${visits.length}` },
            { value: 'videos', label: `動画 ${videos.length}` },
          ]}
        />
        {tab === 'videos' ? (
          videos.length === 0 ? (
            <EmptyState
              title="観た動画のメモを残しましょう"
              description="右下の追加から書けます。"
            />
          ) : (
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {videos.map((v) => (
                <VideoCard key={v.id} video={v} />
              ))}
            </SimpleGrid>
          )
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
      {tab === 'visits' ? (
        <Fab label="記録を書く" onClick={() => setOpened(true)} />
      ) : (
        <Fab label="動画メモを追加" onClick={() => setVideoFormOpened(true)} />
      )}
      <FormDrawer opened={opened} onClose={close} title="見学記録を書く">
        <VisitForm
          visit={null}
          options={options}
          defaults={buildVisitPrefill({ eventId: fromEvent }, fromEventRow ?? null)}
          onSaved={(id) => {
            close()
            navigate({ to: '/records/visits/$id', params: { id } })
          }}
        />
      </FormDrawer>
      <FormDrawer
        opened={videoFormOpened}
        onClose={() => setVideoFormOpened(false)}
        title="動画メモを書く"
      >
        <VideoForm
          options={videoOptions}
          onSaved={(id) => {
            setVideoFormOpened(false)
            navigate({ to: '/records/videos/$id', params: { id } })
          }}
          onCancel={() => setVideoFormOpened(false)}
        />
      </FormDrawer>
    </PageShell>
  )
}
