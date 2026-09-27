import { Alert, Badge, Group, Stack, Table, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import type { GlossaryTerm } from '../../content/glossary'
import { DIAGRAMS } from './diagrams'
import type { GlossarySearch } from './glossarySearch'

/**
 * The display of 1 term. Only for the detail page (`/glossary/$termId`).
 * The term name and reading are handled by the heading of `PageShell`, so only what comes
 * below the one-line definition is rendered here.
 * `search` is the current search condition (`?q` `?c`). It is forwarded so that, even after
 * jumping to another detail through a related term badge, the filter is not lost when
 * going back to the list with "← 用語集" (glossary) from there.
 */
export function TermCard({
  term,
  related,
  search,
}: {
  term: GlossaryTerm
  related: GlossaryTerm[]
  search: GlossarySearch
}) {
  const Diagram = term.diagram ? DIAGRAMS[term.diagram] : undefined

  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        {term.summary}
      </Text>

      {Diagram ? <Diagram /> : null}

      {term.body.map((paragraph, i) => (
        <Text key={i} size="sm">
          {paragraph}
        </Text>
      ))}

      {term.numbers && term.numbers.length > 0 ? (
        <Stack gap={4}>
          <Text size="xs" fw={700} c="dimmed">
            目安
          </Text>
          <Table withRowBorders={false} verticalSpacing={4} horizontalSpacing="xs">
            <Table.Tbody>
              {term.numbers.map((n) => (
                <Table.Tr key={n.label}>
                  <Table.Td>
                    <Text size="sm">{n.label}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {n.value}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      ) : null}

      {term.forUs ? (
        <Alert variant="light" role="note" title="我が家への効き方">
          {term.forUs}
        </Alert>
      ) : null}

      {related.length > 0 ? (
        <Group gap={6}>
          {related.map((r) => (
            // Chip contains a checkbox input, so placing it inside a Link creates a double
            // focus stop. Badge is a purely decorative element, so only the Link itself
            // becomes the focus and screen reading target (same shape as the badge links
            // of VendorCard).
            <Link
              key={r.id}
              to="/glossary/$termId"
              params={{ termId: r.id }}
              search={search}
              aria-label={`用語集で ${r.term} を見る`}
              style={{ textDecoration: 'none' }}
            >
              <Badge variant="light" size="sm">
                {r.term}
              </Badge>
            </Link>
          ))}
        </Group>
      ) : null}
    </Stack>
  )
}
