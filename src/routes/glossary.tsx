import { Accordion, Stack } from '@mantine/core'
import { createFileRoute, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'

import { EmptyState } from '../components/EmptyState'
import { PageShell } from '../components/PageShell'
import { GlossaryFilters } from '../components/glossary/GlossaryFilters'
import { TermCard } from '../components/glossary/TermCard'
import { GLOSSARY, GLOSSARY_CATEGORIES, type CategoryId } from '../content/glossary'
import { findTerm, groupByCategory, relatedTerms, searchGlossary } from '../lib/glossary'

const CATEGORY_IDS = GLOSSARY_CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]]

const search = z.object({
  q: z.string().optional(),
  c: z.enum(CATEGORY_IDS).optional(),
})

export const Route = createFileRoute('/glossary')({
  component: Page,
  validateSearch: (s) => search.parse(s),
})

// hash が指しているカテゴリを開き、見出しへスクロールするまでの猶予。
// Accordion の既定トランジション(200ms)より少し長く取る。
const HASH_SCROLL_DELAY_MS = 240

function Page() {
  const { q, c } = Route.useSearch()
  const navigate = useNavigate({ from: '/glossary' })
  const location = useLocation()
  const [openCategories, setOpenCategories] = useState<string[]>(() => [...CATEGORY_IDS])

  const searched = q ? searchGlossary(GLOSSARY, q) : [...GLOSSARY]
  const filtered = c ? searched.filter((term) => term.category === c) : searched
  const groups = groupByCategory(filtered)

  useEffect(() => {
    const raw = location.hash
    if (!raw.startsWith('term-')) return
    const id = raw.slice('term-'.length)
    const term = findTerm(GLOSSARY, id)
    if (!term) return
    setOpenCategories((prev) => (prev.includes(term.category) ? prev : [...prev, term.category]))
    const timer = window.setTimeout(() => {
      document.getElementById(`term-${id}`)?.scrollIntoView({ block: 'start' })
    }, HASH_SCROLL_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [location.hash])

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
            title="見つかりませんでした"
            description="別のキーワードや、分類の絞り込みを外してお試しください。"
          />
        ) : (
          <Accordion
            multiple
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
                  <Stack gap="xl">
                    {group.terms.map((term) => (
                      <TermCard key={term.id} term={term} related={relatedTerms(GLOSSARY, term)} />
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
