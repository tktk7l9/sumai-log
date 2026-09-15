import { SegmentedControl, SimpleGrid, Stack } from '@mantine/core'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'

import { EmptyState } from '../components/EmptyState'
import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { VideoCard } from '../components/videos/VideoCard'
import { VideoForm } from '../components/videos/VideoForm'
import { VisitCard } from '../components/visits/VisitCard'
import { VisitForm } from '../components/visits/VisitForm'
import { dateKey } from '../lib/calendar'
import { UUID_SHAPE } from '../lib/ids'
import type { Event } from '../db/schema'
import { getEvent } from '../server/events'
import { listVideos, videoFormOptions } from '../server/videos'
import { listVisits, visitFormOptions } from '../server/visits'

const search = z.object({
  tab: z.enum(['visits', 'videos']).default('visits'),
  // 予定から「記録を書く」で来たとき: その予定を初期値にしてフォームを開く
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
    // visitFormOptions の予定一覧は直近 180 日の窓に限られる。窓の外の予定から
    // 「記録を書く」で来た場合はここで個別に引く（無ければ無視して既定値のまま）
    let fromEventRow: Event | undefined
    if (deps.fromEvent && !options.events.some((e) => e.id === deps.fromEvent)) {
      try {
        fromEventRow = (await getEvent({ data: { id: deps.fromEvent } })).event
      } catch {
        // 404: 予定が既に削除されている等。既定値のまま進める
      }
    }
    return { visits, videos, options, videoOptions, fromEventRow }
  },
})

function Page() {
  const {
    visits,
    videos,
    options,
    videoOptions,
    fromEventRow: loadedFromEventRow,
  } = Route.useLoaderData()
  const { tab, fromEvent } = Route.useSearch()
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
    <PageShell title="記録">
      <Stack gap="md">
        <SegmentedControl
          fullWidth
          value={tab}
          onChange={(v) =>
            navigate({
              search: (s) => ({ ...s, tab: v as 'visits' | 'videos' }),
              replace: true,
            })
          }
          data={[
            { value: 'visits', label: `見学記録 ${visits.length}` },
            { value: 'videos', label: 'YouTube' },
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
        <Fab label="YouTube" onClick={() => setVideoFormOpened(true)} />
      )}
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
      <FormDrawer
        opened={videoFormOpened}
        onClose={() => setVideoFormOpened(false)}
        title="YouTube メモを書く"
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
