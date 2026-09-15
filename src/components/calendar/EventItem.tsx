import { ActionIcon, Badge, Button, Card, Group, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { MapPin, Pencil, Trash2 } from 'lucide-react'

import { EVENT_KIND_LABEL } from '../../db/schema'
import { formatEventTime } from '../../lib/calendar'
import type { EventWithLinks } from '../../server/repository'

export function EventItem({
  event,
  recorded,
  onEdit,
  onDelete,
  onRecord,
}: {
  event: EventWithLinks
  recorded: boolean
  onEdit: (e: EventWithLinks) => void
  onDelete: (e: EventWithLinks) => void
  onRecord?: (e: EventWithLinks) => void
}) {
  const who = event.placeName ?? event.vendorName ?? event.propertyName
  return (
    <Card withBorder padding="sm">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
              {formatEventTime(event)}
            </Text>
            <Text fw={600} lineClamp={1}>
              {event.title}
            </Text>
          </Group>
          <Group gap={4} wrap="nowrap">
            <ActionIcon variant="subtle" aria-label="編集" onClick={() => onEdit(event)}>
              <Pencil size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label="削除"
              onClick={() => onDelete(event)}
            >
              <Trash2 size={16} />
            </ActionIcon>
          </Group>
        </Group>
        <Group gap="xs">
          <Badge variant="default" size="xs">
            {EVENT_KIND_LABEL[event.kind]}
          </Badge>
          {who ? (
            <Group gap={4}>
              <MapPin size={12} aria-hidden />
              {event.placeId ? (
                <Link to="/places/$id" params={{ id: event.placeId }}>
                  <Text size="xs" component="span">
                    {who}
                  </Text>
                </Link>
              ) : (
                <Text size="xs" c="dimmed">
                  {who}
                </Text>
              )}
            </Group>
          ) : null}
          {recorded ? (
            <Badge color="teal" variant="light" size="xs">
              記録あり
            </Badge>
          ) : onRecord ? (
            <Button size="compact-xs" variant="light" onClick={() => onRecord(event)}>
              記録を書く
            </Button>
          ) : null}
        </Group>
        {event.note ? (
          <Text size="sm" className="breakable" style={{ whiteSpace: 'pre-wrap' }}>
            {event.note}
          </Text>
        ) : null}
      </Stack>
    </Card>
  )
}
