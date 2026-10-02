import { Button, Chip, Group, Modal, SegmentedControl, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { EmptyState } from '../components/EmptyState'
import { PageShell } from '../components/PageShell'
import { WorkCard } from '../components/works/WorkCard'
import { WorkPlayer } from '../components/works/WorkPlayer'
import { WorkVideoForm } from '../components/works/WorkVideoForm'
import { worksSearchSchema, type WorksSearch } from '../components/works/worksSearch'
import { filterWorks, vendorOptions, watchedSummary } from '../lib/works/filter'
import type { WorkRow } from '../server/repository/works'
import { listWorks, markWorkWatched } from '../server/works'

/** Chip value for "no vendor filter" (not a vendor id) */
const ALL = 'all'

/** How long 「視聴済みにしました／取り消す」 stays */
const UNDO_NOTICE_MS = 10_000

export const Route = createFileRoute('/works')({
  component: Page,
  validateSearch: (s) => worksSearchSchema.parse(s),
  loader: async () => ({ works: await listWorks() }),
})

/** The latest non-null value, kept after the value goes back to null */
function useLast<T>(value: T | null): T | null {
  const [last, setLast] = useState(value)
  if (value !== null && value !== last) setLast(value)
  return value ?? last
}

function Page() {
  const { works } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/works' })
  const router = useRouter()
  const mark = useServerFn(markWorkWatched)
  const [playing, setPlaying] = useState<WorkRow | null>(null)
  const [editingVideo, setEditingVideo] = useState<WorkRow | null>(null)

  const vendors = vendorOptions(works)
  // An id that matches no vendor (an old or hand-typed URL) is treated as no filter
  const vendorId = vendors.some((vendor) => vendor.id === search.v) ? search.v : undefined
  // Mantine keeps a closing Modal on screen for its transition; keep showing the last work
  const shownPlaying = useLast(playing)
  const shownEditing = useLast(editingVideo)
  const visible = filterWorks(works, {
    vendorId,
    hasVideo: search.video,
    unwatched: search.unwatched,
  })
  const summary = watchedSummary(works)

  function setSearch(patch: Partial<WorksSearch>) {
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true })
  }

  async function setWatched(work: WorkRow, watched: boolean): Promise<boolean> {
    try {
      await mark({ data: { id: work.id, watched } })
      await router.invalidate()
      return true
    } catch {
      notifications.show({ message: '保存できませんでした', color: 'red' })
      return false
    }
  }

  /** Mark as watched with no confirm dialog: say it, and offer the undo (SHIG 57, 54) */
  async function markWatchedWithUndo(work: WorkRow) {
    if (!(await setWatched(work, true))) return
    const notificationId = `watched-${work.id}`
    notifications.show({
      id: notificationId,
      // Longer than the 4 s default: the mark often happens while a video is still on screen
      autoClose: UNDO_NOTICE_MS,
      message: (
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="sm">視聴済みにしました</Text>
          <Button
            variant="subtle"
            size="sm"
            onClick={() => {
              notifications.hide(notificationId)
              void setWatched(work, false)
            }}
          >
            取り消す
          </Button>
        </Group>
      ),
    })
  }

  return (
    <PageShell title="施工例" description="候補の会社の施工例をまとめて見る">
      {works.length === 0 ? (
        <EmptyState
          emoji="🏡"
          title="施工例がまだありません"
          description="取り込みが済むとここに並びます。"
        />
      ) : (
        <Stack gap="lg">
          <Stack gap="xs">
            <Chip.Group
              value={vendorId ?? ALL}
              onChange={(v) => setSearch({ v: v === ALL ? undefined : (v as string) })}
            >
              <Group gap={6}>
                <Chip value={ALL} size="xs">
                  すべて
                </Chip>
                {vendors.map((vendor) => (
                  <Chip key={vendor.id} value={vendor.id} size="xs">
                    {vendor.name}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
            <Group gap={6}>
              <Chip
                size="xs"
                checked={search.video === true}
                onChange={(on) => setSearch({ video: on ? true : undefined })}
              >
                動画あり
              </Chip>
              <Chip
                size="xs"
                checked={search.unwatched === true}
                onChange={(on) => setSearch({ unwatched: on ? true : undefined })}
              >
                まだ見ていない
              </Chip>
            </Group>
            <Group justify="space-between" align="center">
              <Text size="sm">
                {summary.total} 件中 {summary.watched} 件を視聴済み
              </Text>
              <SegmentedControl
                size="xs"
                aria-label="表示"
                value={search.view ?? 'list'}
                onChange={(v) => setSearch({ view: v === 'spec' ? 'spec' : undefined })}
                data={[
                  { value: 'list', label: '一覧' },
                  { value: 'spec', label: '揃えて見る' },
                ]}
              />
            </Group>
          </Stack>

          {visible.length === 0 ? (
            <EmptyState emoji="🔍" title="条件に合う施工例がありません" />
          ) : (
            <Stack gap="md">
              {visible.map((work) => (
                <WorkCard
                  key={work.id}
                  work={work}
                  showSpecs={search.view === 'spec'}
                  onPlay={() => setPlaying(work)}
                  onToggleWatched={() =>
                    void (work.watchedAt === null
                      ? markWatchedWithUndo(work)
                      : setWatched(work, false))
                  }
                  onEditVideo={() => setEditingVideo(work)}
                />
              ))}
            </Stack>
          )}
        </Stack>
      )}

      <Modal
        opened={playing !== null}
        onClose={() => setPlaying(null)}
        title={shownPlaying?.title}
        size="xl"
        centered
      >
        {shownPlaying?.youtubeVideoId ? (
          <WorkPlayer
            videoId={shownPlaying.youtubeVideoId}
            title={shownPlaying.title}
            onWatched={() => {
              // Reached the end (or 90%) in the embedded player; nothing to do when already watched
              if (shownPlaying.watchedAt === null) void markWatchedWithUndo(shownPlaying)
            }}
          />
        ) : null}
      </Modal>

      <Modal
        opened={editingVideo !== null}
        onClose={() => setEditingVideo(null)}
        title={shownEditing?.title}
        centered
      >
        {shownEditing ? (
          <WorkVideoForm
            // A fresh form per work: the kept one must not carry the previous work's input
            key={shownEditing.id}
            work={shownEditing}
            onCancel={() => setEditingVideo(null)}
            onSaved={() => {
              setEditingVideo(null)
              void router.invalidate()
            }}
          />
        ) : null}
      </Modal>
    </PageShell>
  )
}
