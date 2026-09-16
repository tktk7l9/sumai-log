import { Card, Stack, Text, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import { dateKey, formatDateWithWeekday, formatEventTime } from '../../lib/calendar'
import type { EventWithLinks } from '../../server/repository'

export function UpcomingEvents({ events }: { events: EventWithLinks[] }) {
  return (
    <Stack gap="sm">
      <Title order={2}>次の予定</Title>
      {events.length === 0 ? (
        <Text c="dimmed">予定はありません</Text>
      ) : (
        <Stack gap="sm">
          {events.map((e) => {
            const who = e.placeName ?? e.vendorName ?? e.propertyName
            const key = dateKey(e.startsAt)
            return (
              <Stack key={e.id} gap={4}>
                <Text size="sm" fw={600}>
                  {`${formatDateWithWeekday(key)} ${formatEventTime(e)}`.trim()}
                </Text>
                <Link
                  to="/calendar"
                  search={{ m: key.slice(0, 7), d: key }}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <Card withBorder padding="md">
                    <Stack gap={4}>
                      <Text fw={600} lineClamp={2}>
                        {e.title}
                      </Text>
                      {who ? (
                        <Text size="sm">{who}</Text>
                      ) : (
                        <Text size="sm" c="dimmed">
                          場所未設定
                        </Text>
                      )}
                    </Stack>
                  </Card>
                </Link>
              </Stack>
            )
          })}
        </Stack>
      )}
    </Stack>
  )
}
