import { Card, Group, Stack, Text } from '@mantine/core'
import { MapPinOff } from 'lucide-react'

import type { Place } from '../../db/schema'
import { PlacesMapLazy } from '../map/PlacesMapLazy'
import type { MapConfig } from '../../server/mapConfig'

/** The map frame of the detail page. With coordinates, shows a single pin in PlacesMapLazy */
export function PlaceLocation({
  place,
  visited,
  mapConfig,
}: {
  place: Place
  visited: boolean
  mapConfig: MapConfig
}) {
  if (place.lat == null || place.lng == null) {
    return (
      <Card withBorder padding="md" className="sunken">
        {/* This is on a sunken surface, so the text stays in the body color instead of
            dimmed (same reason as the empty state) */}
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
          apiKey={mapConfig.apiKey}
          mapId={mapConfig.mapId}
          gesture="cooperative"
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
