import { Anchor, Stack, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import type { NewsEventRow } from '../../server/repository'
import { NewsAgenda } from '../news/NewsAgenda'

/**
 * ホームの「お知らせ」ブロック。最新 5 件（loader 側で listVendorNews({ limit: 5 })
 * 済み）を `NewsAgenda`（AgendaView）で表示する（所有者の要望、2026-09-16）。0 件のときも
 * NewsAgenda 自身が「お知らせはありません」を出すので、ここでは「すべて見る」リンクの
 * 出し分けだけ持つ（0 件のときは `/news` に行っても何も無いので出さない）。
 */
export function HomeNews({ items }: { items: NewsEventRow[] }) {
  return (
    <Stack gap="sm">
      <Title order={2}>お知らせ</Title>
      <NewsAgenda items={items} hideHeader />
      {items.length > 0 ? (
        <Anchor component={Link} to="/news" size="sm" fw={600} style={{ alignSelf: 'flex-start' }}>
          すべて見る
        </Anchor>
      ) : null}
    </Stack>
  )
}
