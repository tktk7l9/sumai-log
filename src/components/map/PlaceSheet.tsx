import { Badge, Button, Drawer, Group, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import { PLACE_KIND_LABEL } from '../../db/schema'
import type { PlaceWithLinks } from '../../server/repository'

/** ピンをタップしたときに下から出す簡易カード */
export function PlaceSheet({
  place,
  onClose,
}: {
  place: PlaceWithLinks | null
  onClose: () => void
}) {
  return (
    <Drawer
      opened={place != null}
      onClose={onClose}
      position="bottom"
      size="auto"
      title={place?.name}
      padding="md"
      // Leaflet の操作コントロール（地図タブの現在地ボタンなど）は z-index: 1000 で
      // 描かれるため、Mantine の既定（modal: 200）のままだとシートの下に隠れる
      zIndex={1300}
    >
      {place ? (
        <Stack gap="xs">
          <Group gap="xs">
            <Badge variant="default">{PLACE_KIND_LABEL[place.kind]}</Badge>
          </Group>
          {place.vendorName ? <Text size="sm">業者: {place.vendorName}</Text> : null}
          {place.propertyName ? <Text size="sm">マンション物件: {place.propertyName}</Text> : null}
          {place.address ? (
            <Text size="sm" c="dimmed">
              {place.address}
            </Text>
          ) : null}
          <Link to="/places/$id" params={{ id: place.id }}>
            <Button component="span" fullWidth>
              詳細を見る
            </Button>
          </Link>
        </Stack>
      ) : null}
    </Drawer>
  )
}
