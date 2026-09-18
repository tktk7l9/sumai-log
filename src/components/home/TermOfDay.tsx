import { Card, Group, Stack, Text, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { BookOpen } from 'lucide-react'

import type { TermOfDay as TermOfDayRow } from '../../server/glossary'

/** ホームの「今日の用語」。日替わりで用語集から 1 語。押すと用語集の詳細へ */
export function TermOfDay({ term }: { term: TermOfDayRow | null }) {
  if (!term) return null
  return (
    <Stack gap="sm">
      <Title order={2}>今日の用語</Title>
      <Link
        to="/glossary/$termId"
        params={{ termId: term.id }}
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        <Card withBorder padding="md">
          <Group wrap="nowrap" align="flex-start" gap="sm">
            <BookOpen size={20} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Group gap="xs" align="baseline">
                <Text fw={700}>{term.term}</Text>
                {term.reading ? (
                  <Text size="xs" c="dimmed">
                    {term.reading}
                  </Text>
                ) : null}
              </Group>
              <Text size="sm">{term.summary}</Text>
            </Stack>
          </Group>
        </Card>
      </Link>
    </Stack>
  )
}
