import { Chip, SegmentedControl, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'

import { ChipRow } from '../components/ChipRow'
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
import { filterVideos, tagOptions, vendorOptions } from '../lib/videoFilter'
import { memoDefaultsOf } from '../lib/videoMemo'
import type { Event } from '../db/schema'
import { getChannelVideoForMemo } from '../server/channelVideos'
import { getEvent } from '../server/events'
import { listVideos, videoFormOptions } from '../server/videos'
import { listVisits, visitFormOptions } from '../server/visits'

const search = z.object({
  tab: z.enum(['visits', 'videos']).default('visits'),
  // When arriving from an event through "記録を書く" (Write a record): open the form with that
  // event as the initial values
  fromEvent: z.string().regex(UUID_SHAPE).optional(),
  // When arriving from the videos tab through "メモを書く" (Write a memo): the YouTube id of
  // the channel video; the memo form opens filled in from it
  video: z
    .string()
    .regex(/^[A-Za-z0-9_-]{11}$/)
    .optional()
    .catch(undefined),
  // Videos tab: narrow the memos by a tag, a vendor and a part of the title or channel. Each
  // falls back to "not set" on an unknown value, like the works page
  tag: z.string().max(30).optional().catch(undefined),
  vendor: z.string().max(60).optional().catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
})

/** Chip value for "no filter" (not a tag or a vendor id) */
const ALL = 'all'
const SEARCH_DEBOUNCE_MS = 250

/**
 * The search field writes `?q=` only after the debounce and with replace (same reasoning as
 * the videos tab of /works: no history entry per keystroke, and an outside change of q only
 * realigns it)
 */
function MemoSearch({ q, onChange }: { q: string | undefined; onChange: (q: string) => void }) {
  const [input, setInput] = useState(q ?? '')
  const [debounced] = useDebouncedValue(input, SEARCH_DEBOUNCE_MS)
  const qRef = useRef(q)
  qRef.current = q
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    setInput(q ?? '')
  }, [q])

  useEffect(() => {
    if (debounced !== input) return
    if (debounced.trim() !== (qRef.current ?? '')) onChangeRef.current(debounced.trim())
  }, [debounced])

  return (
    <TextInput
      value={input}
      onChange={(e) => setInput(e.currentTarget.value)}
      placeholder="題名・チャンネルで検索"
      leftSection={<Search size={16} aria-hidden />}
      aria-label="題名・チャンネルで検索"
    />
  )
}

export const Route = createFileRoute('/records')({
  component: Page,
  validateSearch: (s) => search.parse(s),
  loaderDeps: ({ search }) => ({ fromEvent: search.fromEvent, video: search.video }),
  loader: async ({ deps }) => {
    const [visits, videos, options, videoOptions, channelVideo] = await Promise.all([
      listVisits(),
      listVideos(),
      visitFormOptions(),
      videoFormOptions(),
      // A video that is not a channel video still gets its URL filled in (memoDefaultsOf)
      deps.video
        ? getChannelVideoForMemo({ data: { videoId: deps.video } }).then((r) => r.video)
        : null,
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
    const memoDefaults = deps.video ? memoDefaultsOf(deps.video, channelVideo) : null
    return { visits, videos, options, videoOptions, fromEventRow, memoDefaults }
  },
})

function Page() {
  const {
    visits: loadedVisits,
    videos: loadedVideos,
    options,
    videoOptions,
    fromEventRow: loadedFromEventRow,
    memoDefaults,
  } = Route.useLoaderData()
  // Rows whose deletion can still be undone are hidden at once
  const pendingDeletes = usePendingDeletes()
  const visits = loadedVisits.filter((v) => !pendingDeletes.has(v.id))
  const videos = loadedVideos.filter((v) => !pendingDeletes.has(v.id))
  const { tab: tabParam, fromEvent, video: fromVideo, tag, vendor, q } = Route.useSearch()
  // When arriving from an event through "記録を書く", always open the visits tab even without
  // the tab parameter; from a channel video through "メモを書く", the videos tab
  const tab = fromEvent ? 'visits' : fromVideo ? 'videos' : tabParam
  const navigate = useNavigate({ from: '/records' })
  const router = useRouter()
  const [opened, setOpened] = useState(fromEvent !== undefined)
  const [videoFormOpened, setVideoFormOpened] = useState(fromVideo !== undefined)
  const fromEventRow = fromEvent
    ? (options.events.find((e) => e.id === fromEvent) ?? loadedFromEventRow)
    : undefined
  // Filters of the videos tab. A tag or vendor that no memo has (an old URL) counts as no filter
  const tags = tagOptions(videos)
  const vendors = vendorOptions(videos)
  const activeTag = tags.some((t) => t.name === tag) ? tag : undefined
  const activeVendor = vendors.some((v) => v.id === vendor) ? vendor : undefined
  const visibleVideos = filterVideos(videos, { tag: activeTag, vendorId: activeVendor, q })
  const filtering = Boolean(activeTag || activeVendor || q)

  function setFilter(patch: { tag?: string; vendor?: string; q?: string }) {
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true })
  }

  function close() {
    setOpened(false)
    if (fromEvent) navigate({ search: (s) => ({ ...s, fromEvent: undefined }) })
  }

  function closeVideoForm() {
    setVideoFormOpened(false)
    if (fromVideo) navigate({ search: (s) => ({ ...s, video: undefined }), replace: true })
  }

  /** A memo started from the videos tab returns there (the list then shows 「メモを見る」) */
  function afterVideoSaved(id: string) {
    setVideoFormOpened(false)
    if (!fromVideo) {
      navigate({ to: '/records/videos/$id', params: { id } })
    } else if (router.history.length > 1) {
      router.history.back()
    } else {
      navigate({ to: '/works' })
    }
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
            <Stack gap="sm">
              {/* Narrowing by what every memo carries: the tags, the vendor (SHIG 51, 28) */}
              {tags.length > 0 ? (
                <Chip.Group
                  value={activeTag ?? ALL}
                  onChange={(v) => setFilter({ tag: v === ALL ? undefined : (v as string) })}
                >
                  <ChipRow label="タグで絞り込む">
                    <Chip value={ALL} size="xs">
                      すべて {videos.length}
                    </Chip>
                    {tags.map((t) => (
                      <Chip key={t.name} value={t.name} size="xs">
                        {t.name} {t.count}
                      </Chip>
                    ))}
                  </ChipRow>
                </Chip.Group>
              ) : null}
              {vendors.length > 0 ? (
                <Chip.Group
                  value={activeVendor ?? ALL}
                  onChange={(v) => setFilter({ vendor: v === ALL ? undefined : (v as string) })}
                >
                  <ChipRow label="業者で絞り込む">
                    <Chip value={ALL} size="xs">
                      全業者
                    </Chip>
                    {vendors.map((v) => (
                      <Chip key={v.id} value={v.id} size="xs">
                        {v.name} {v.count}
                      </Chip>
                    ))}
                  </ChipRow>
                </Chip.Group>
              ) : null}
              <MemoSearch q={q} onChange={(value) => setFilter({ q: value || undefined })} />
              {filtering ? (
                <Text size="xs" c="dimmed">
                  該当 {visibleVideos.length} 本
                </Text>
              ) : null}
              {visibleVideos.length === 0 ? (
                <EmptyState emoji="🔍" title="条件に合う動画メモがありません" />
              ) : (
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                  {visibleVideos.map((v) => (
                    <VideoCard key={v.id} video={v} />
                  ))}
                </SimpleGrid>
              )}
            </Stack>
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
      <FormDrawer opened={videoFormOpened} onClose={closeVideoForm} title="動画メモを書く">
        <VideoForm
          // A fresh form per video: the one started from another video must not carry its input
          key={fromVideo ?? 'new'}
          options={videoOptions}
          defaults={memoDefaults ?? undefined}
          onSaved={afterVideoSaved}
          onCancel={closeVideoForm}
        />
      </FormDrawer>
    </PageShell>
  )
}
