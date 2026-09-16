import { Stack, Text } from '@mantine/core'

import { formatDateWithWeekday, groupByDayKeepOrder } from '../../lib/calendar'
import type { NewsEventRow } from '../../server/repository'
import { NewsRow } from './NewsRow'

/**
 * お知らせの一覧。publishedOn の日付見出し（曜日付き）でまとめる。既に新しい順で
 * 渡ってくる前提（listVendorNews の並び）なので、groupByDayKeepOrder で並べ替えずに
 * まとめるだけにする。0 件のときは何も描画しない（空表示は呼び出し側の責務。
 * ホームは 1 行のみ・`/news` は EmptyState と、場面で見た目が違うため）。
 */
export function NewsList({
  items,
  onPlan,
  planningId = null,
}: {
  items: NewsEventRow[]
  onPlan?: (newsId: string) => void
  planningId?: string | null
}) {
  if (items.length === 0) return null

  const groups = groupByDayKeepOrder(items, (item) => item.publishedOn)

  return (
    <Stack gap="lg">
      {groups.map((group) => (
        <Stack key={group.day} gap={6}>
          <Text size="sm" fw={600}>
            {formatDateWithWeekday(group.day)}
          </Text>
          <Stack gap="sm">
            {group.items.map((item) => (
              <NewsRow
                key={item.id}
                item={item}
                onPlan={onPlan}
                planning={planningId === item.id}
              />
            ))}
          </Stack>
        </Stack>
      ))}
    </Stack>
  )
}
