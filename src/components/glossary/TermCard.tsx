import { Alert, Badge, Group, Stack, Table, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import type { GlossaryTerm } from '../../content/glossary'
import { DIAGRAMS } from './diagrams'
import type { GlossarySearch } from './glossarySearch'

/**
 * 用語 1 件分の表示。詳細ページ（`/glossary/$termId`）専用。
 * 用語名・読みは `PageShell` の見出しが担うので、ここでは一言定義より下だけを描く。
 * `search` は今の検索条件（`?q` `?c`）。関連語バッジで別の詳細に飛んでも、
 * そこから「← 用語集」で一覧に戻ったときに絞り込みが消えないよう転送する。
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
            // Chip はチェックボックス入力を内包するため Link の中に置くと二重フォーカス
            // ストップになる。Badge はただの装飾要素なので、Link 自体だけが
            // フォーカス・読み上げ対象になる（VendorCard のバッジリンクと同じ形）。
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
