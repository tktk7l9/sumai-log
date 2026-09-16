import { Button, Chip, Group, Stack } from '@mantine/core'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

import { EmptyState } from '../components/EmptyState'
import { PageShell } from '../components/PageShell'
import { NewsAgenda } from '../components/news/NewsAgenda'
import { UUID_SHAPE } from '../lib/ids'
import { listVendorNews, newsSources } from '../server/news'

/** 1 ページぶんの件数。「もっと見る」を押すごとに PAGE_SIZE 件ずつ増やす */
const PAGE_SIZE = 50
/** 表示する件数の上限（4 ページぶん） */
const MAX_LIMIT = 200

const newsSearchSchema = z.object({
  // 絞り込み対象の業者 id。壊れた値（手打ち・古いブックマーク等）は絞り込み無しに倒す
  v: z.string().regex(UUID_SHAPE).optional().catch(undefined),
  // 「もっと見る」を押した回数 + 1（1 なら PAGE_SIZE 件、2 なら PAGE_SIZE*2 件…）
  p: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT / PAGE_SIZE)
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute('/news')({
  component: Page,
  validateSearch: (s) => newsSearchSchema.parse(s),
  loaderDeps: ({ search }) => ({ v: search.v, p: search.p }),
  loader: async ({ deps }) => {
    const limit = Math.min(MAX_LIMIT, PAGE_SIZE * (deps.p ?? 1))
    // 表示上限に +1 件だけ多く問い合わせ、その 1 件が返ってきたかどうかで
    // 「もっと見る」を出すかを正確に判定する（ちょうど limit 件で終わる空振り
    // クリックを避ける。listVendorNewsInput の limit 上限は 201 まで許容済み）。
    const [{ news: fetched }, { sources }] = await Promise.all([
      listVendorNews({ data: { vendorId: deps.v, limit: limit + 1, offset: 0 } }),
      newsSources(),
    ])
    const hasMore = fetched.length > limit
    return { news: fetched.slice(0, limit), sources, limit, hasMore }
  },
})

function Page() {
  const { news, sources, limit, hasMore } = Route.useLoaderData()
  const { v, p } = Route.useSearch()
  const navigate = useNavigate({ from: '/news' })

  // hasMore は loader が limit+1 件を問い合わせて実測済み（正確な判定）。
  // 表示上限に既に達している場合はこれ以上増やせないので出さない。
  const canLoadMore = hasMore && limit < MAX_LIMIT

  return (
    <PageShell title="お知らせ">
      <Stack gap="md">
        {sources.length > 0 ? (
          <Chip.Group
            value={v ?? null}
            onChange={(next) =>
              navigate({
                search: (s) => ({ ...s, v: (next as string) || undefined, p: undefined }),
                replace: true,
              })
            }
          >
            <Group gap={6}>
              {sources.map((source) => (
                <Chip key={source.id} value={source.id} size="xs">
                  {source.name}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        ) : null}

        {news.length === 0 ? (
          <EmptyState emoji="📰" title="まだお知らせはありません" />
        ) : (
          <>
            <NewsAgenda items={news} />
            {canLoadMore ? (
              <Button
                variant="light"
                fullWidth
                onClick={() =>
                  navigate({ search: (s) => ({ ...s, p: (p ?? 1) + 1 }), replace: true })
                }
              >
                もっと見る
              </Button>
            ) : null}
          </>
        )}
      </Stack>
    </PageShell>
  )
}
