import { Accordion, Group, NavLink, Stack, Text } from '@mantine/core'
import { createFileRoute, Link, useLocation, useNavigate } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'

import { EmptyState } from '../components/EmptyState'
import { PageShell } from '../components/PageShell'
import { GlossaryFilters } from '../components/glossary/GlossaryFilters'
import { CATEGORY_IDS, glossarySearchSchema } from '../components/glossary/glossarySearch'
import { GLOSSARY } from '../content/glossary'
import { findTerm, groupByCategory, searchGlossary } from '../lib/glossary'

export const Route = createFileRoute('/glossary')({
  component: Page,
  validateSearch: (s) => glossarySearchSchema.parse(s),
})

function Page() {
  const { q, c } = Route.useSearch()
  const navigate = useNavigate({ from: '/glossary' })
  const location = useLocation()
  const [openCategories, setOpenCategories] = useState<string[]>(() => [...CATEGORY_IDS])

  const searched = q ? searchGlossary(GLOSSARY, q) : [...GLOSSARY]
  const filtered = c ? searched.filter((term) => term.category === c) : searched
  const groups = groupByCategory(filtered)

  // 旧形式 `#term-<id>` で直接開かれた／ブックマークされたリンクを、詳細ページへ
  // 案内する（バッジ類は書き換え済みだが、外部のブックマークや共有リンクは残りうる）。
  useEffect(() => {
    const raw = location.hash
    if (!raw.startsWith('term-')) return
    const id = raw.slice('term-'.length)
    const term = findTerm(GLOSSARY, id)
    if (!term) return
    navigate({ to: '/glossary/$termId', params: { termId: id }, replace: true })
  }, [location.hash, navigate])

  // 検索・絞り込みを変えたら、畳んであった分類も開き直す（「性能 2」と出ているのに
  // 中身が見えず 0 件と誤解しないように）。
  useEffect(() => {
    if (q || c) setOpenCategories([...CATEGORY_IDS])
  }, [q, c])

  return (
    <PageShell
      title="用語集"
      description="家づくりとマンション購入でよく出てくる言葉を、一言と図で"
    >
      <Stack gap="md">
        <GlossaryFilters
          q={q}
          category={c}
          onQueryChange={(v) =>
            navigate({ search: (s) => ({ ...s, q: v || undefined }), replace: true })
          }
          onCategoryChange={(v) =>
            navigate({ search: (s) => ({ ...s, c: v ?? undefined }), replace: true })
          }
        />

        {groups.length === 0 ? (
          <EmptyState
            emoji="🔎"
            title="見つかりませんでした"
            description="別のキーワードや、分類の絞り込みを外してお試しください。"
          />
        ) : (
          <Accordion
            multiple
            order={2}
            variant="separated"
            value={openCategories}
            onChange={setOpenCategories}
          >
            {groups.map((group) => (
              <Accordion.Item key={group.category.id} value={group.category.id}>
                <Accordion.Control>
                  {group.category.label} {group.terms.length}
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap={0}>
                    {group.terms.map((term) => (
                      <NavLink
                        key={term.id}
                        renderRoot={(rootProps) => (
                          <Link
                            {...rootProps}
                            to="/glossary/$termId"
                            params={{ termId: term.id }}
                            search={{ q, c }}
                          />
                        )}
                        label={
                          <Group gap={6}>
                            <Text fw={600} span>
                              {term.term}
                            </Text>
                            {term.reading ? (
                              <Text size="xs" c="dimmed" span>
                                {term.reading}
                              </Text>
                            ) : null}
                          </Group>
                        }
                        description={
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {term.summary}
                          </Text>
                        }
                        rightSection={<ChevronRight size={16} aria-hidden />}
                      />
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        )}
      </Stack>
    </PageShell>
  )
}
