import { Anchor, Stack, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import type { NewsEventRow } from '../../server/repository'
import { NewsAgenda } from '../news/NewsAgenda'

/**
 * The "お知らせ" (Vendor news) block on the home page. Shows the latest 5 items (already
 * fetched by the loader with listVendorNews({ limit: 5 })) in `NewsAgenda` (AgendaView)
 * (owner's request, 2026-09-16). With 0 items NewsAgenda itself shows
 * "お知らせはありません" (No vendor news), so this component only decides whether to show
 * the "すべて見る" (See all) link (with 0 items there is nothing at `/news` either, so it
 * is not shown).
 * `todayKey` (today in JST as decided by the server) is passed to NewsAgenda to dim news
 * whose event dates have ended.
 */
export function HomeNews({ items, todayKey }: { items: NewsEventRow[]; todayKey: string }) {
  return (
    <Stack gap="sm">
      <Title order={2}>お知らせ</Title>
      <NewsAgenda items={items} hideHeader todayKey={todayKey} />
      {items.length > 0 ? (
        <Anchor component={Link} to="/news" size="sm" fw={600} style={{ alignSelf: 'flex-start' }}>
          すべて見る
        </Anchor>
      ) : null}
    </Stack>
  )
}
