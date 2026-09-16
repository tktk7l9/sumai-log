import { Badge, Group, Stack, Text, UnstyledButton } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { AgendaView } from '@mantine/schedule'
import type { AgendaViewProps, ScheduleEventData } from '@mantine/schedule'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { extractErrorMessage } from '../../lib/formError'
import { dateKey, formatDateWithWeekday } from '../../lib/calendar'
import { newsToAgendaEvents, type NewsEventPayload } from '../../lib/scheduleEvents'
import { SCHEDULE_LABELS_JA } from '../../lib/scheduleLabels'
import { planVisitFromNews } from '../../server/news'
import type { NewsEventRow } from '../../server/repository'
import { EventBadge } from './EventBadge'
import { FormDrawer } from '../FormDrawer'
import { NewsEventDrawer } from './NewsEventDrawer'

/**
 * 0 件のときも AgendaView には有効な日付レンジが要る（rangeStart/rangeEnd は必須 prop）。
 * ヘッダーの日付表示（M/D – M/D）は「お知らせはありません」の上に出るだけで意味を持たない
 * ため、呼び出し時点の日付を使う（items が空でも今日を指す、以外の期待値は無い）。
 * 呼び出し側が明示の rangeStart/rangeEnd を渡すとき（/news の月ごとのアジェンダ。
 * 月初〜月末を渡したい＝件数に依らない固定レンジ）はこちらを使わない。
 */
function agendaRange(items: readonly NewsEventRow[]): { start: string; end: string } {
  if (items.length === 0) {
    const today = dateKey(new Date().toISOString())
    return { start: today, end: today }
  }
  let start = items[0].publishedOn
  let end = items[0].publishedOn
  for (const item of items) {
    if (item.publishedOn < start) start = item.publishedOn
    if (item.publishedOn > end) end = item.publishedOn
  }
  return { start, end }
}

/**
 * お知らせを https://mantine.dev/schedule/agenda-view/ の AgendaView で見せる、ホーム・
 * `/news` 共通の一覧（所有者の要望、2026-09-16）。行は「業者名（dimmed）＋タイトル＋
 * イベントバッジ＋（予定化済みなら）予定ありバッジ」の読み取り専用表示にとどめ、クリック
 * すると `NewsEventDrawer`（「行く」/「予定を見る」）を開く。行く操作自体はこのドロワーの
 * 中に一本化する（ホーム・`/news` の両方でボタンの置き場所を揃えるため）。
 *
 * `rangeStart`/`rangeEnd` を省略するとホームと同じ「items の publishedOn の min/max」に
 * なる。`/news`（月ごとのアジェンダ、fix round 1）はその月の初日/末日を明示で渡し、
 * 0 件の月でも月の範囲がヘッダーに出るようにする。`emptyLabel` も同様に省略時は
 * ホームと同じ「お知らせはありません」、`/news` は「この月のお知らせはありません」を渡す。
 */
export function NewsAgenda({
  items,
  rangeStart,
  rangeEnd,
  emptyLabel = 'お知らせはありません',
}: {
  items: NewsEventRow[]
  rangeStart?: string
  rangeEnd?: string
  emptyLabel?: string
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const planVisit = useServerFn(planVisitFromNews)
  const [drawerNewsId, setDrawerNewsId] = useState<string | null>(null)
  const [planningId, setPlanningId] = useState<string | null>(null)

  const agendaEvents = newsToAgendaEvents(items)
  const range = rangeStart && rangeEnd ? { start: rangeStart, end: rangeEnd } : agendaRange(items)
  const labels: AgendaViewProps['labels'] = { ...SCHEDULE_LABELS_JA, noEvents: emptyLabel }
  const drawerNews = drawerNewsId ? (items.find((n) => n.id === drawerNewsId) ?? null) : null

  function handleEventClick(event: ScheduleEventData) {
    const payload = event.payload as NewsEventPayload | undefined
    if (payload) setDrawerNewsId(payload.newsId)
  }

  async function handlePlan(news: NewsEventRow) {
    setPlanningId(news.id)
    try {
      await planVisit({ data: { newsId: news.id } })
      await router.invalidate()
      notifications.show({ message: '予定を追加しました' })
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
    } finally {
      setPlanningId(null)
    }
  }

  /** ドロワーの「予定を見る」（既に「行く」済み）。カレンダーの該当日へ移動する
   * （NewsRow が旧 NewsList で持っていた挙動と同じ。ここには EventForm を編集する画面が
   * 無いため、予定そのものの編集はカレンダー側に任せる）。
   * plannedEventId が付くのは planVisitFromNews が eventStart 必須で作る予定だけ
   * （src/server/news.ts）なので、通常は eventStart も必ずある。それでも
   * plannedEventId はあるのに eventStart が無い（データ不整合等の）行き違いが
   * あったときに、日付が特定できないからと何もせず素通りするのは避け、今日の
   * カレンダーへ連れて行く（fix round 1 指摘）。*/
  function handleViewEvent(news: NewsEventRow) {
    setDrawerNewsId(null)
    if (news.eventStart) {
      navigate({ to: '/calendar', search: { m: news.eventStart.slice(0, 7), d: news.eventStart } })
      return
    }
    navigate({ to: '/calendar' })
  }

  // AgendaView の既定レンダリングは行内側に padding を持つ（agendaViewEventBody）が、
  // renderEvent を渡すとその内側マークアップは使われず自前で組み立てる必要がある。
  // ここで padding/gap を持たせないと、行同士が境界線だけでくっついて見える
  // （所有者の報告、2026-09-16）。業者名／タイトル／バッジをそれぞれ別の行にして
  // 4px の gap で束ね、行全体に上下 8px の padding を持たせる（タップ領域は
  // 44px を十分超える）。行どうしの区切りは AgendaView 既定の border-bottom
  // （rootProps 経由）をそのまま使う。
  const renderEvent: AgendaViewProps['renderEvent'] = (event, rootProps) => {
    const payload = event.payload as NewsEventPayload | undefined
    const item = payload ? items.find((n) => n.id === payload.newsId) : undefined
    if (!item) return <UnstyledButton {...rootProps} />
    return (
      <UnstyledButton {...rootProps}>
        <Stack gap={4} py={8} px="sm">
          <Text size="sm" c="dimmed">
            {item.vendorName}
          </Text>
          <Text size="sm" fw={600}>
            {item.title}
          </Text>
          {item.eventKind || item.plannedEventId ? (
            <Group gap={6} wrap="wrap" align="center">
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
          ) : null}
        </Stack>
      </UnstyledButton>
    )
  }

  return (
    <>
      <AgendaView
        className="news-agenda"
        rangeStart={range.start}
        rangeEnd={range.end}
        events={agendaEvents}
        locale="ja"
        labels={labels}
        dateHeaderFormat={(date) => formatDateWithWeekday(dateKey(date))}
        headerFormat="M/D"
        renderEvent={renderEvent}
        onEventClick={handleEventClick}
      />
      <FormDrawer
        opened={drawerNews !== null}
        onClose={() => setDrawerNewsId(null)}
        title="お知らせ"
      >
        {drawerNews ? (
          <NewsEventDrawer
            news={drawerNews}
            planning={planningId === drawerNews.id}
            onPlan={() => handlePlan(drawerNews)}
            onViewEvent={() => handleViewEvent(drawerNews)}
          />
        ) : null}
      </FormDrawer>
    </>
  )
}
