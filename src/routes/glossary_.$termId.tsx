import { Badge, Button, Stack } from '@mantine/core'
import { Link, createFileRoute, notFound } from '@tanstack/react-router'

import { EmptyState } from '../components/EmptyState'
import { PageShell } from '../components/PageShell'
import { TermCard } from '../components/glossary/TermCard'
import { GLOSSARY, GLOSSARY_CATEGORIES } from '../content/glossary'
import { findTerm, relatedTerms } from '../lib/glossary'

export const Route = createFileRoute('/glossary_/$termId')({
  component: Page,
  notFoundComponent: TermNotFound,
  loader: ({ params }) => {
    const term = findTerm(GLOSSARY, params.termId)
    if (!term) throw notFound()
    return { term, related: relatedTerms(GLOSSARY, term) }
  },
})

function BackLink() {
  return (
    <Button component={Link} to="/glossary" variant="subtle" size="sm" px={0}>
      ← 用語集
    </Button>
  )
}

function Page() {
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
        <TermCard term={term} related={related} hideTitle />
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
