import { Badge, Card, Group, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { MapPinOff } from 'lucide-react'

import { EmptyState } from '../EmptyState'
import { PLACE_KIND_LABEL } from '../../db/schema'
import type { PlaceWithLinks } from '../../server/repository'

/**
 * 地図タブの「一覧」表示（所有者の要望、2026-09-21）。地図と同じ場所を同じ絞り込みで
 * 縦に並べる。地図と違って**座標の無い場所も出せる**のがこの表示の要点で、
 * 「地図に出せない場所が N 件（一覧で確認）」の確認先がここになる。
 *
 * 行は読み取り専用のカードで、タップすると場所の詳細（/places/$id）へ行く
 * （地図のピン → PlaceSheet → 「詳細を見る」と同じ行き先）。
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
                {/* 地図に出せない場所は「出せない理由」を画面に書く（AGENTS.md の約束） */}
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
