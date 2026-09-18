import { List, Stack, Text, Timeline } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'

import { PageShell } from '../components/PageShell'
import { CHANGELOG } from '../content/changelog'
import { formatDateSlash } from '../lib/calendar'

export const Route = createFileRoute('/changelog')({
  component: Page,
  head: () => ({ meta: [{ title: '変更履歴 | 住まいログ' }] }),
})

function Page() {
  return (
    <PageShell title="変更履歴" description="アプリに加えた機能や見た目の変更。新しい順">
      <Timeline active={CHANGELOG.length} bulletSize={14} lineWidth={2} color="clay">
        {CHANGELOG.map((entry, i) => (
          <Timeline.Item
            key={`${entry.date}-${i}`}
            title={
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  {formatDateSlash(entry.date)}
                </Text>
                <Text fw={700}>{entry.title}</Text>
              </Stack>
            }
          >
            <List size="sm" spacing={4} mt={4}>
              {entry.items.map((item) => (
                <List.Item key={item}>{item}</List.Item>
              ))}
            </List>
          </Timeline.Item>
        ))}
      </Timeline>
    </PageShell>
  )
}
