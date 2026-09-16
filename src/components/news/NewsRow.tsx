import { Anchor, Button, Group, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import type { NewsEventRow } from '../../server/repository'
import { EventBadge } from './EventBadge'

/**
 * お知らせ 1 件。日付見出しは親（NewsList の groupByDayKeepOrder）が担うので
 * ここでは出さない。`onPlan` が無ければ操作を一切出さない（ホームのブロック用。
 * design.md §4「ホーム」はバッジまでで「行く」ボタンを持たない）。
 */
export function NewsRow({
  item,
  onPlan,
  planning = false,
}: {
  item: NewsEventRow
  onPlan?: (newsId: string) => void
  planning?: boolean
}) {
  const eventStart = item.eventStart
  const showAction = onPlan !== undefined && item.eventKind !== null && eventStart !== null

  return (
    <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
      <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
        <Text size="sm" lh={1.5}>
          {item.vendorName}「
          <Anchor href={item.url} target="_blank" rel="noopener noreferrer" fw={600}>
            {item.title}
          </Anchor>
          」
        </Text>
        <EventBadge
          eventKind={item.eventKind}
          eventStart={item.eventStart}
          eventEnd={item.eventEnd}
        />
      </Stack>
      {showAction ? (
        item.plannedEventId ? (
          <Link
            to="/calendar"
            search={{ m: eventStart.slice(0, 7), d: eventStart }}
            style={{ flexShrink: 0 }}
          >
            <Button component="span" size="compact-sm" variant="light">
              予定を見る
            </Button>
          </Link>
        ) : (
          <Button
            size="compact-sm"
            loading={planning}
            onClick={() => onPlan?.(item.id)}
            style={{ flexShrink: 0 }}
          >
            行く
          </Button>
        )
      ) : null}
    </Group>
  )
}
