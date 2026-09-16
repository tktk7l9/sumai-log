import { Anchor, Stack, Text, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import type { NewsEventRow } from '../../server/repository'
import { NewsList } from '../news/NewsList'

/**
 * ホームの「業者のお知らせ」ブロック。最新 5 件（loader 側で listVendorNews({ limit: 5 })
 * 済み）。design.md §4「ホーム」のとおり操作は持たない（onPlan を渡さない＝NewsRow は
 * バッジまでで「行く」ボタンを出さない）。
 */
export function HomeNews({ items }: { items: NewsEventRow[] }) {
  return (
    <Stack gap="sm">
      <Title order={2}>業者のお知らせ</Title>
      {items.length === 0 ? (
        <Text c="dimmed">まだお知らせはありません</Text>
      ) : (
        <>
          <NewsList items={items} />
          <Anchor
            component={Link}
            to="/news"
            size="sm"
            fw={600}
            style={{ alignSelf: 'flex-start' }}
          >
            すべて見る
          </Anchor>
        </>
      )}
    </Stack>
  )
}
