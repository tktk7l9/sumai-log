import { Button, Chip, Group, Stack } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { z } from 'zod'

import { EmptyState } from '../components/EmptyState'
import { PageShell } from '../components/PageShell'
import { NewsList } from '../components/news/NewsList'
import { extractErrorMessage } from '../lib/formError'
import { UUID_SHAPE } from '../lib/ids'
import { listVendorNews, newsSources, planVisitFromNews } from '../server/news'

/** 1 ページぶんの件数。「もっと見る」を押すごとに PAGE_SIZE 件ずつ増やす */
const PAGE_SIZE = 50
/** listVendorNewsInput の limit 上限（src/server/news.schema.ts）と揃える */
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
    const [{ news }, { sources }] = await Promise.all([
      listVendorNews({ data: { vendorId: deps.v, limit, offset: 0 } }),
      newsSources(),
    ])
    return { news, sources, limit }
  },
})

function Page() {
  const { news, sources, limit } = Route.useLoaderData()
  const { v, p } = Route.useSearch()
  const navigate = useNavigate({ from: '/news' })
  const router = useRouter()
  const planVisit = useServerFn(planVisitFromNews)
  const [planningId, setPlanningId] = useState<string | null>(null)

  async function handlePlan(newsId: string) {
    setPlanningId(newsId)
    try {
      await planVisit({ data: { newsId } })
      await router.invalidate()
      notifications.show({ message: '予定を追加しました' })
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
    } finally {
      setPlanningId(null)
    }
  }

  // ちょうど limit 件返ってきたら「まだあるかもしれない」とみなす（実件数と一致していても
  // 空振りのもう一押しで済む程度の誤差なので、正確な hasMore を別途は問い合わせない）
  const canLoadMore = news.length === limit && limit < MAX_LIMIT

  return (
    <PageShell title="業者のお知らせ">
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
            <NewsList items={news} onPlan={handlePlan} planningId={planningId} />
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
