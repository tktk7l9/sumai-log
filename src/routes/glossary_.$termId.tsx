import { Badge, Stack } from '@mantine/core'
import { Link, createFileRoute, notFound } from '@tanstack/react-router'

import { EmptyState } from '../components/EmptyState'
import { BackButton, PageShell } from '../components/PageShell'
import { TermCard } from '../components/glossary/TermCard'
import { glossarySearchSchema } from '../components/glossary/glossarySearch'
import { GLOSSARY, GLOSSARY_CATEGORIES } from '../content/glossary'
import { findTerm, relatedTerms } from '../lib/glossary'

export const Route = createFileRoute('/glossary_/$termId')({
  component: Page,
  notFoundComponent: TermNotFound,
  validateSearch: (s) => glossarySearchSchema.parse(s),
  loader: ({ params }) => {
    const term = findTerm(GLOSSARY, params.termId)
    if (!term) throw notFound()
    return { term, related: relatedTerms(GLOSSARY, term) }
  },
  // The notFoundComponent side has no loaderData, so the tab title stays the default of __root.tsx
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: `${loaderData.term.term} | 用語集 | 住まいログ` }] : [],
  }),
})

// Carries the search and filter of the list side (`?q` `?c`) back to "← 用語集" (Glossary) as is.
// However many times list -> detail -> related term -> ... is followed, the filter is not lost
// on the final return.
function BackLink() {
  const { q, c } = Route.useSearch()
  return (
    <BackButton
      label="用語集"
      renderLink={(rootProps) => <Link {...rootProps} to="/glossary" search={{ q, c }} />}
    />
  )
}

function Page() {
  const { q, c } = Route.useSearch()
  const { term, related } = Route.useLoaderData()
  const category = GLOSSARY_CATEGORIES.find((cat) => cat.id === term.category)

  return (
    <PageShell title={term.term} description={term.reading ?? term.summary}>
      <Stack gap="md">
        <Stack gap={4}>
          <BackLink />
          {category ? (
            <Badge variant="default" style={{ alignSelf: 'flex-start' }}>
              {category.label}
            </Badge>
          ) : null}
        </Stack>
        <TermCard term={term} related={related} search={{ q, c }} />
      </Stack>
    </PageShell>
  )
}

function TermNotFound() {
  return (
    <PageShell title="用語集">
      <Stack gap="md">
        <BackLink />
        <EmptyState
          emoji="🔎"
          title="見つかりませんでした"
          description="この用語は用語集にありません。削除されたか、リンクが違う可能性があります。"
        />
      </Stack>
    </PageShell>
  )
}
