import { Card, Group, Stack, Text } from '@mantine/core'
import { MapPinOff } from 'lucide-react'

import type { Place } from '../../db/schema'
import { PlacesMapLazy } from '../map/PlacesMapLazy'

/** 詳細ページの地図枠。座標があれば PlacesMapLazy に 1 件だけピンを出す */
export function PlaceLocation({ place, visited }: { place: Place; visited: boolean }) {
  if (place.lat == null || place.lng == null) {
    return (
      <Card withBorder padding="md" className="sunken">
        {/* 沈めた面の上なので、文字は dimmed に落とさず本文色のまま置く（空状態と同じ理由） */}
        <Group gap={8} wrap="nowrap">
          <MapPinOff size={16} aria-hidden />
          <Text size="sm">
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
      <div style={{ height: 240, borderRadius: 'var(--mantine-radius-md)', overflow: 'hidden' }}>
        <PlacesMapLazy
          markers={[{ id: place.id, name: place.name, lat: place.lat, lng: place.lng, visited }]}
          focusId={place.id}
        />
      </div>
      {place.geocodeSource === 'manual' ? (
        <Text size="xs" c="dimmed">
          座標は手貼り（{place.coordsText}）
        </Text>
      ) : null}
    </Stack>
  )
}
