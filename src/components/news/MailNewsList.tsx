import { Badge, Button, Chip, Group, Stack, Text, UnstyledButton } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { Check, Mail } from 'lucide-react'
import { useState } from 'react'

import { formatDateWithWeekday } from '../../lib/calendar'
import { isRecent } from '../../lib/freshness'
import type { Member } from '../../lib/members'
import { isPastNews } from '../../lib/scheduleEvents'
import type { MailNewsSummary, NewsEventRow } from '../../server/repository'
import { ChipRow } from '../ChipRow'
import { EmptyState } from '../EmptyState'
import { FormDrawer } from '../FormDrawer'
import { NewBadge } from '../FreshBadge'
import { MemberChip } from '../MemberChip'
import { EventBadge } from './EventBadge'
import { NewsEventDrawer } from './NewsEventDrawer'
import { useNewsRead } from './useNewsRead'

/** Chip value for "every vendor" (not a vendor id) */
const ALL = 'all'

export type MailNewsSearch = {
  /** vendors.id */
  v?: string
  /** Only the unread ones */
  unread?: true
  /** How many rows are shown (grows with 「さらに表示」) */
  n?: number
}

/**
 * The 「メルマガ」 (newsletters) tab of /news: the vendor news that came from mail
 * (design 2026-09-19), one vendor or all, every month on one list, newest first. Each row
 * says whether it was read and by whom (one flag shared by the two users, like the watched
 * flag of the videos). Tapping a row opens the same drawer as the monthly list and marks the
 * newsletter read; 「未読に戻す」 in the drawer takes that back.
 */
export function MailNewsList({
  news,
  vendors,
  members,
  search,
  setSearch,
  todayKey,
  limit,
}: {
  news: NewsEventRow[]
  /** Every vendor with newsletters and its counts (the chips and the unread line) */
  vendors: MailNewsSummary[]
  members: readonly Member[]
  search: MailNewsSearch
  setSearch: (patch: Partial<MailNewsSearch>) => void
  /** Today ('YYYY-MM-DD' in JST): 「New」 and the dimming of newsletters whose dates have ended */
  todayKey: string
  /** How many rows the loader was asked for (the same number again on 「さらに表示」) */
  limit: number
}) {
  const navigate = useNavigate()
  const { setRead, openRead } = useNewsRead()
  const [drawerNewsId, setDrawerNewsId] = useState<string | null>(null)

  // A vendor id that matches no vendor (an old or hand-typed URL) is treated as no filter
  const vendorId = vendors.some((v) => v.vendorId === search.v) ? search.v : undefined
  const scope = vendorId ? vendors.filter((v) => v.vendorId === vendorId) : vendors
  const total = scope.reduce((sum, v) => sum + v.total, 0)
  const unread = scope.reduce((sum, v) => sum + v.unread, 0)
  const drawerNews = drawerNewsId ? (news.find((n) => n.id === drawerNewsId) ?? null) : null

  /** "行く" in the drawer: opens the event form in the calendar (same as NewsAgenda) */
  function handlePlan(item: NewsEventRow) {
    setDrawerNewsId(null)
    const key = item.eventStart ?? item.publishedOn
    navigate({ to: '/calendar', search: { m: key.slice(0, 7), d: key, plan: item.id } })
  }

  /** "予定を見る" in the drawer: that day in the calendar (same as NewsAgenda) */
  function handleViewEvent(item: NewsEventRow) {
    setDrawerNewsId(null)
    if (item.eventStart) {
      navigate({ to: '/calendar', search: { m: item.eventStart.slice(0, 7), d: item.eventStart } })
      return
    }
    navigate({ to: '/calendar' })
  }

  if (vendors.length === 0) {
    return (
      <EmptyState
        emoji="📨"
        title="メルマガはまだありません"
        description="設定の「メール取込」で転送が始まるとここに並びます。"
      />
    )
  }

  return (
    <>
      <Stack gap="sm">
        <ChipRow label="メルマガの絞り込み">
          <Chip.Group
            value={vendorId ?? ALL}
            onChange={(next) =>
              setSearch({ v: next === ALL ? undefined : (next as string), n: undefined })
            }
          >
            <Chip value={ALL} size="xs">
              すべて
            </Chip>
            {vendors.map((v) => (
              <Chip key={v.vendorId} value={v.vendorId} size="xs">
                {v.vendorName}
                {v.unread > 0 ? `（未読 ${v.unread}）` : ''}
              </Chip>
            ))}
          </Chip.Group>
          <Chip
            size="xs"
            checked={search.unread === true}
            onChange={(on) => setSearch({ unread: on ? true : undefined, n: undefined })}
          >
            未読だけ
          </Chip>
        </ChipRow>
        {/* One line: how many there are, and how many are still unread */}
        <Text size="sm">
          未読 {unread} 通／全 {total} 通
        </Text>
        {news.length === 0 ? (
          <Text size="sm" c="dimmed" py="sm">
            該当するメルマガはありません
          </Text>
        ) : (
          <div className="news-agenda">
            {news.map((item) => {
              const read = item.readAt !== null
              const past = isPastNews(item, todayKey)
              const fresh = isRecent(item.publishedOn, todayKey)
              return (
                <UnstyledButton
                  key={item.id}
                  className="news-agenda-row"
                  data-past={past ? true : undefined}
                  onClick={() => {
                    openRead(item)
                    setDrawerNewsId(item.id)
                  }}
                >
                  <Stack gap={4} py={8} px="sm">
                    <Text size="xs" c="dimmed">
                      {formatDateWithWeekday(item.publishedOn)}
                      {vendorId ? '' : `・${item.vendorName}`}
                    </Text>
                    {/* Unread stands out by weight as well as by the badge (not colour alone) */}
                    <Text size="sm" fw={read ? 500 : 700} c={past ? 'dimmed' : undefined}>
                      {item.title}
                    </Text>
                    <Group gap={6} wrap="wrap" align="center">
                      {read ? (
                        <Badge
                          size="sm"
                          color="gray"
                          variant="light"
                          leftSection={<Check size={12} aria-hidden />}
                        >
                          既読
                        </Badge>
                      ) : (
                        <Badge
                          size="sm"
                          variant="light"
                          leftSection={<Mail size={12} aria-hidden />}
                        >
                          未読
                        </Badge>
                      )}
                      {read && item.readBy ? (
                        <MemberChip email={item.readBy} members={members} />
                      ) : null}
                      {fresh ? <NewBadge /> : null}
                      <EventBadge
                        eventKind={item.eventKind}
                        eventStart={item.eventStart}
                        eventEnd={item.eventEnd}
                      />
                      {item.plannedEventId ? (
                        <Badge size="xs" variant="light">
                          予定あり
                        </Badge>
                      ) : null}
                    </Group>
                  </Stack>
                </UnstyledButton>
              )
            })}
          </div>
        )}
        {news.length >= limit ? (
          <Button variant="default" onClick={() => setSearch({ n: limit + limit })}>
            さらに表示
          </Button>
        ) : null}
      </Stack>
      <FormDrawer
        opened={drawerNews !== null}
        onClose={() => setDrawerNewsId(null)}
        title="お知らせ"
      >
        {drawerNews ? (
          <NewsEventDrawer
            news={drawerNews}
            planning={false}
            onPlan={() => handlePlan(drawerNews)}
            onViewEvent={() => handleViewEvent(drawerNews)}
            onSetRead={(read) => void setRead(drawerNews, read)}
          />
        ) : null}
      </FormDrawer>
    </>
  )
}
