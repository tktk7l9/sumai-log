import { Card, Group, Stack, Text } from '@mantine/core'
import { MapPinOff } from 'lucide-react'

import type { Place } from '../../db/schema'
import { formatLatLng } from '../../lib/coords'

/**
 * 詳細ページの地図枠。
 *
 * Task 7 時点では地図（PlacesMapLazy）がまだ無いので座標のテキスト表示に留める。
 * Task 8 で「座標あり」分岐を PlacesMapLazy に差し替える。
 */
export function PlaceLocation({ place }: { place: Place }) {
  if (place.lat == null || place.lng == null) {
    return (
      <Card withBorder padding="md" bg="var(--mantine-color-default-hover)">
        <Group gap={8} wrap="nowrap">
          <MapPinOff size={16} aria-hidden />
          <Text size="sm" c="dimmed">
            {place.address
              ? '住所から座標を引けていないため地図を出せません。編集して座標を貼ってください。'
              : '住所も座標も登録されていないため地図を出せません。'}
          </Text>
        </Group>
      </Card>
    )
  }
  return (
    <Stack gap={4}>
      <Text size="sm">座標: {formatLatLng({ lat: place.lat, lng: place.lng })}</Text>
      {place.geocodeSource === 'manual' ? (
        <Text size="xs" c="dimmed">
          座標は手貼り（{place.coordsText}）
        </Text>
      ) : null}
    </Stack>
  )
}
