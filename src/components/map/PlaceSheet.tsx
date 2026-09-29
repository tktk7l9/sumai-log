import { Badge, Button, Drawer, Group, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import { PLACE_KIND_LABEL } from '../../db/schema'
import type { PlaceWithLinks } from '../../server/repository'

/** A simple card that comes up from the bottom when a pin is tapped */
export function PlaceSheet({
  place,
  onClose,
}: {
  place: PlaceWithLinks | null
  onClose: () => void
}) {
  return (
    // Composed from the parts so that the header is a <div>, not a second "banner" landmark
    // (same as FormDrawer)
    <Drawer.Root
      opened={place != null}
      onClose={onClose}
      position="bottom"
      // In Mantine 9, a Drawer with position="bottom" does not shrink to its content even
      // with size="auto"; it always takes the full screen height
      // (the implementation forces flex-basis to 100% for top/bottom).
      // Following the spec "tap to get a card from the bottom", make it a small card of
      // fixed height.
      // 300px is a value confirmed on real devices (390×844 and 1280×800) to fit the name
      // heading + kind badge + vendor name + condominium property name + a longish
      // (2 lines) address + the "詳細を見る" (See details) button all shown together.
      // No overflow occurs (confirmed scrollHeight === clientHeight === 300)
      size={300}
      padding="md"
      // Controls overlaid on the map (such as the current location button of the map tab)
      // are drawn at z-index: 1000, so with the Mantine default (modal: 200) the sheet
      // would be hidden under them
      zIndex={1300}
    >
      <Drawer.Overlay />
      <Drawer.Content>
        <Drawer.Header component="div">
          <Drawer.Title>{place?.name}</Drawer.Title>
          <Drawer.CloseButton aria-label="閉じる" />
        </Drawer.Header>
        <Drawer.Body>
          {place ? (
            <Stack gap="xs">
              <Group gap="xs">
                <Badge variant="default">{PLACE_KIND_LABEL[place.kind]}</Badge>
              </Group>
              {place.vendorName ? <Text size="sm">業者: {place.vendorName}</Text> : null}
              {place.propertyName ? (
                <Text size="sm">マンション物件: {place.propertyName}</Text>
              ) : null}
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
        </Drawer.Body>
      </Drawer.Content>
    </Drawer.Root>
  )
}
