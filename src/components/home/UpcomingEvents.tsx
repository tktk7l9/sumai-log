import { Card, Group, Stack, Text, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import { dateKey, formatEventTime } from '../../lib/calendar'
import type { EventWithLinks } from '../../server/repository'

export function UpcomingEvents({ events }: { events: EventWithLinks[] }) {
  return (
    <Stack gap="xs">
      <Title order={2}>次の予定</Title>
      {events.length === 0 ? (
        <Text c="dimmed">予定はありません</Text>
      ) : (
        <Stack gap="xs">
          {events.map((e) => {
            const who = e.placeName ?? e.vendorName ?? e.propertyName
            const key = dateKey(e.startsAt)
            return (
              <Link
                key={e.id}
                to="/calendar"
                search={{ m: key.slice(0, 7), d: key }}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <Card withBorder padding="sm">
                  <Stack gap={4}>
                    <Group gap="xs" wrap="nowrap">
                      <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                        {key} {formatEventTime(e)}
                      </Text>
                      <Text fw={600} lineClamp={1}>
                        {e.title}
                      </Text>
                    </Group>
                    {who ? (
                      <Text size="xs" c="dimmed">
                        {who}
                      </Text>
                    ) : null}
                  </Stack>
                </Card>
              </Link>
            )
          })}
        </Stack>
      )}
    </Stack>
  )
}
