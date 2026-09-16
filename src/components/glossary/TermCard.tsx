import { Alert, Badge, Group, Stack, Table, Text, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import type { GlossaryTerm } from '../../content/glossary'
import { DIAGRAMS } from './diagrams'

/**
 * 用語 1 件分の表示。詳細ページ（`/glossary/$termId`）で使う。
 * `hideTitle` は詳細ページ用: `PageShell` が見出し（用語名・読み）を出すので、
 * ここでの二重表示を避けたいときに渡す。見出しを出すときは `id="term-<id>"` を保つ
 * （ページ内アンカーとして参照されうるため、害はない）。
 */
export function TermCard({
  term,
  related,
  hideTitle = false,
}: {
  term: GlossaryTerm
  related: GlossaryTerm[]
  hideTitle?: boolean
}) {
  const Diagram = term.diagram ? DIAGRAMS[term.diagram] : undefined

  return (
    <Stack gap="xs">
      {hideTitle ? null : (
        <Stack gap={2}>
          {/* AppShell.Header は fixed で高さ 52px。ページ内アンカーで直接開いたとき
              見出しがヘッダの下に隠れないよう、scroll-margin-top で逃がす */}
          <Title order={3} id={`term-${term.id}`} fz="md" style={{ scrollMarginTop: 68 }}>
            {term.term}
          </Title>
          {term.reading ? (
            <Text size="xs" c="dimmed">
              {term.reading}
            </Text>
          ) : null}
        </Stack>
      )}

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
