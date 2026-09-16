import { Badge, Button, Stack } from '@mantine/core'
import { Link, createFileRoute, notFound } from '@tanstack/react-router'

import { EmptyState } from '../components/EmptyState'
import { PageShell } from '../components/PageShell'
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
})

// 一覧側の検索・絞り込み（`?q` `?c`）をそのまま「← 用語集」へ持ち帰る。
// 一覧→詳細→関連語→…と何度たどっても、最後に戻ったとき絞り込みが消えない。
function BackLink() {
  const { q, c } = Route.useSearch()
  return (
    <Button
      renderRoot={(rootProps) => <Link {...rootProps} to="/glossary" search={{ q, c }} />}
      variant="subtle"
      size="sm"
      px={0}
    >
      ← 用語集
    </Button>
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
