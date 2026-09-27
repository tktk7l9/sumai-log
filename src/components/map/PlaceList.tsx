import { Badge, Card, Group, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { MapPinOff } from 'lucide-react'

import { EmptyState } from '../EmptyState'
import { PLACE_KIND_LABEL } from '../../db/schema'
import type { PlaceWithLinks } from '../../server/repository'

/**
 * The "一覧" (List) view of the map tab (owner's request, 2026-09-21). Lists the same
 * places as the map, with the same filter, vertically. Unlike the map, **it can also show
 * places without coordinates**; that is the point of this view, and it is where
 * "地図に出せない場所が N 件（一覧で確認）" (N places cannot be shown on the map (check in
 * the list)) sends the user to check.
 *
 * A row is a read-only card; tapping it goes to the place detail (/places/$id)
 * (the same destination as map pin -> PlaceSheet -> "詳細を見る" (See details)).
 */
export function PlaceList({ places }: { places: PlaceWithLinks[] }) {
  if (places.length === 0) {
    return (
      <EmptyState emoji="📍" title="場所がありません" description="右下の追加から登録できます。" />
    )
  }
  return (
    <Stack gap="sm">
      {places.map((place) => {
        const subtitle = place.vendorName ?? place.propertyName
        return (
          <Link
            key={place.id}
            to="/places/$id"
            params={{ id: place.id }}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <Card withBorder padding="md">
              <Stack gap={4}>
                <Group gap="xs" wrap="wrap">
                  <Badge variant="default">{PLACE_KIND_LABEL[place.kind]}</Badge>
                  {place.visited ? (
                    <Badge variant="light" color="clay">
                      行った
                    </Badge>
                  ) : (
                    <Badge variant="light" color="gray">
                      予定
                    </Badge>
                  )}
                </Group>
                <Text fw={700} lineClamp={2} lh={1.4}>
                  {place.name}
                </Text>
                {subtitle ? (
                  <Text size="sm" c="dimmed">
                    {subtitle}
                  </Text>
                ) : null}
                {place.address ? (
                  <Text size="sm" c="dimmed" className="breakable">
                    {place.address}
                  </Text>
                ) : null}
                {/* For a place that cannot be shown on the map, write "the reason it cannot
                    be shown" on the screen (a promise in AGENTS.md) */}
                {place.lat == null || place.lng == null ? (
                  <Group gap={6} wrap="nowrap" c="dimmed">
                    <MapPinOff size={14} aria-hidden />
                    <Text size="xs">住所から座標を出せないため地図には出せません</Text>
                  </Group>
                ) : null}
              </Stack>
            </Card>
          </Link>
        )
      })}
    </Stack>
  )
}
