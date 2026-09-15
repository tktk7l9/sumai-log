import { Stack } from '@mantine/core'

import type { EventWithLinks } from '../../server/repository'
import { EventItem } from './EventItem'

export function EventList({
  events,
  recordedEventIds,
  onEdit,
  onDelete,
  onRecord,
}: {
  events: EventWithLinks[]
  recordedEventIds: ReadonlySet<string>
  onEdit: (e: EventWithLinks) => void
  onDelete: (e: EventWithLinks) => void
  onRecord?: (e: EventWithLinks) => void
}) {
  return (
    <Stack gap="xs" w="100%">
      {events.map((e) => (
        <EventItem
          key={e.id}
          event={e}
          recorded={recordedEventIds.has(e.id)}
          onEdit={onEdit}
          onDelete={onDelete}
          onRecord={onRecord}
        />
      ))}
    </Stack>
  )
}
