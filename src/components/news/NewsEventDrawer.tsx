import { Anchor, Button, Stack, Text } from '@mantine/core'

import { formatDateWithWeekday } from '../../lib/calendar'
import type { NewsEventRow } from '../../server/repository'
import { EventBadge } from './EventBadge'

/**
 * お知らせをタップしたときに開くドロワーの中身。カレンダーの情報レイヤー
 * （src/routes/calendar.tsx の FormDrawer）と、お知らせのアジェンダ表示
 * （src/components/news/NewsAgenda.tsx の FormDrawer）の両方で使う共通部品。
 * 「行く」で自分の予定に変換すると（router.invalidate 後、同じ news をこの props に
 * 渡し直せば）plannedEventId が付き、ボタンが自動的に「予定を見る」に変わる。
 */
export function NewsEventDrawer({
  news,
  planning,
  onPlan,
  onViewEvent,
}: {
  news: NewsEventRow
  planning: boolean
  onPlan: () => void
  onViewEvent: () => void
}) {
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {news.vendorName}
      </Text>
      <Anchor href={news.url} target="_blank" rel="noopener noreferrer" fw={600}>
        {news.title}
      </Anchor>
      <EventBadge
        eventKind={news.eventKind}
        eventStart={news.eventStart}
        eventEnd={news.eventEnd}
      />
      <Text size="xs" c="dimmed">
        公開日 {formatDateWithWeekday(news.publishedOn)}
      </Text>
      {news.plannedEventId ? (
        <Button onClick={onViewEvent}>予定を見る</Button>
      ) : (
        <Button onClick={onPlan} loading={planning}>
          行く
        </Button>
      )}
    </Stack>
  )
}
