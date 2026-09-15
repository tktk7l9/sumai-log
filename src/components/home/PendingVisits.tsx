import { Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import { dateKey } from '../../lib/calendar'
import type { EventWithLinks } from '../../server/repository'

export function PendingVisits({ events }: { events: EventWithLinks[] }) {
  if (events.length === 0) return null
  return (
    <Stack gap="xs">
      <Title order={2}>記録を書きませんか</Title>
      <Stack gap="xs">
        {events.map((e) => {
          const who = e.placeName ?? e.vendorName ?? e.propertyName
          return (
            <Card key={e.id} withBorder padding="sm">
              <Group justify="space-between" wrap="nowrap" align="center">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text size="sm" c="dimmed">
                    {dateKey(e.startsAt)}
                  </Text>
                  <Text fw={600} lineClamp={1}>
                    {e.title}
                  </Text>
                  {who ? (
                    <Text size="xs" c="dimmed">
                      {who}
                    </Text>
                  ) : null}
                </Stack>
                <Link
                  to="/records"
                  search={{ tab: 'visits', fromEvent: e.id }}
                  style={{ flexShrink: 0 }}
                >
                  <Button component="span" size="compact-sm">
                    記録を書く
                  </Button>
                </Link>
              </Group>
            </Card>
          )
        })}
      </Stack>
    </Stack>
  )
}
