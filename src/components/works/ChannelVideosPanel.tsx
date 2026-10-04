import { Button, Chip, Group, Modal, Stack, Text, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { CHANNEL_VIDEO_KINDS, CHANNEL_VIDEO_KIND_LABEL } from '../../db/schema'
import { markChannelVideoWatched } from '../../server/channelVideos'
import { CHANNEL_VIDEO_PAGE } from '../../server/channelVideos.schema'
import type { ChannelSummary, ChannelVideoRow } from '../../server/repository/channelVideos'
import { EmptyState } from '../EmptyState'
import { isRecent } from '../../lib/freshness'
import { ChannelVideoCard } from './ChannelVideoCard'
import { showWatchedNotice } from './watchedNotice'
import { WorkPlayer } from './WorkPlayer'
import type { WorksSearch } from './worksSearch'

/** Chip value for "no filter" (not a channel id or a kind) */
const ALL = 'all'
const SEARCH_DEBOUNCE_MS = 250

export type ChannelVideosPage = {
  rows: ChannelVideoRow[]
  matched: number
  channels: ChannelSummary[]
  /** Today (JST, 'YYYY-MM-DD') by the server, for the "New" tag */
  todayKey: string
}

/** The latest non-null value, kept after the value goes back to null (for a closing Modal) */
function useLast<T>(value: T | null): T | null {
  const [last, setLast] = useState(value)
  if (value !== null && value !== last) setLast(value)
  return value ?? last
}

/**
 * The search field writes `?q=` only after the debounce and with replace (same reasoning as
 * GlossaryFilters: no history entry per keystroke, and an outside change of q only realigns it).
 */
function TitleSearch({ q, onChange }: { q: string | undefined; onChange: (q: string) => void }) {
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
      placeholder="タイトルで検索（例: ルームツアー）"
      leftSection={<Search size={16} aria-hidden />}
      aria-label="タイトルで検索"
    />
  )
}

export function ChannelVideosPanel({
  page,
  search,
  setSearch,
}: {
  page: ChannelVideosPage
  search: WorksSearch
  setSearch: (patch: Partial<WorksSearch>) => void
}) {
  const router = useRouter()
  const mark = useServerFn(markChannelVideoWatched)
  const [playing, setPlaying] = useState<ChannelVideoRow | null>(null)
  const shownPlaying = useLast(playing)

  // A channel id that matches no channel (an old or hand-typed URL) is treated as no filter
  const channelId = page.channels.some((c) => c.channelId === search.ch) ? search.ch : undefined
  const scope = channelId ? page.channels.filter((c) => c.channelId === channelId) : page.channels
  const total = scope.reduce((sum, c) => sum + c.total, 0)
  const watched = scope.reduce((sum, c) => sum + c.watched, 0)
  const allTotal = page.channels.reduce((sum, c) => sum + c.total, 0)
  const limit = search.n ?? CHANNEL_VIDEO_PAGE

  async function setWatched(video: ChannelVideoRow, on: boolean): Promise<boolean> {
    try {
      await mark({ data: { id: video.id, watched: on } })
      await router.invalidate()
      return true
    } catch {
      notifications.show({ message: '保存できませんでした', color: 'red' })
      return false
    }
  }

  async function markWatchedWithUndo(video: ChannelVideoRow) {
    if (await setWatched(video, true)) {
      showWatchedNotice(video.id, () => void setWatched(video, false))
    }
  }

  if (allTotal === 0) {
    return (
      <EmptyState
        emoji="🎬"
        title="動画がまだありません"
        description="取り込みが済むとここに並びます。"
      />
    )
  }

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Chip.Group
          value={channelId ?? ALL}
          onChange={(v) => setSearch({ ch: v === ALL ? undefined : (v as string), n: undefined })}
        >
          <Group gap={6}>
            <Chip value={ALL} size="xs">
              すべて {allTotal}
            </Chip>
            {page.channels.map((c) => (
              <Chip key={c.channelId} value={c.channelId} size="xs">
                {c.channel} {c.total}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
        <Chip.Group
          value={search.kind ?? ALL}
          onChange={(v) =>
            setSearch({
              kind: v === ALL ? undefined : (v as WorksSearch['kind']),
              n: undefined,
            })
          }
        >
          <Group gap={6}>
            <Chip value={ALL} size="xs">
              全種類
            </Chip>
            {CHANNEL_VIDEO_KINDS.map((kind) => (
              <Chip key={kind} value={kind} size="xs">
                {CHANNEL_VIDEO_KIND_LABEL[kind]}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
        <Group gap={6}>
          <Chip
            size="xs"
            checked={search.unwatched === true}
            onChange={(on) => setSearch({ unwatched: on ? true : undefined, n: undefined })}
          >
            まだ見ていない
          </Chip>
        </Group>
        <TitleSearch
          q={search.q}
          onChange={(q) => setSearch({ q: q || undefined, n: undefined })}
        />
        <Text size="sm">
          {total} 本中 {watched} 本を視聴済み
        </Text>
      </Stack>

      {page.rows.length === 0 ? (
        <EmptyState emoji="🔍" title="条件に合う動画がありません" />
      ) : (
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            該当 {page.matched} 本
          </Text>
          {page.rows.map((video) => (
            <ChannelVideoCard
              key={video.id}
              video={video}
              fresh={isRecent(video.publishedAt, page.todayKey)}
              onPlay={() => setPlaying(video)}
              onToggleWatched={() =>
                void (video.watchedAt === null
                  ? markWatchedWithUndo(video)
                  : setWatched(video, false))
              }
            />
          ))}
          {page.matched > page.rows.length ? (
            <Button
              variant="default"
              mih={44}
              onClick={() => setSearch({ n: limit + CHANNEL_VIDEO_PAGE })}
            >
              もっと見る（残り {page.matched - page.rows.length} 本）
            </Button>
          ) : null}
        </Stack>
      )}

      <Modal
        opened={playing !== null}
        onClose={() => setPlaying(null)}
        title={shownPlaying?.title}
        size="xl"
        centered
      >
        {shownPlaying ? (
          <WorkPlayer
            videoId={shownPlaying.videoId}
            title={shownPlaying.title}
            onWatched={() => {
              if (shownPlaying.watchedAt === null) void markWatchedWithUndo(shownPlaying)
            }}
          />
        ) : null}
      </Modal>
    </Stack>
  )
}
