import { Button, Chip, Group, Stack, Text } from '@mantine/core'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { z } from 'zod'

import { PageShell } from '../components/PageShell'
import { NewsAgenda } from '../components/news/NewsAgenda'
import { UUID_SHAPE } from '../lib/ids'
import { listVendorNews, newsSources } from '../server/news'

/** 1 か月ぶんの安全上限（もっと見るページングは fix round 1 で廃止。通常は届かない） */
const MONTH_LIMIT = 200

const MONTH_SHAPE = /^\d{4}-\d{2}$/

const newsSearchSchema = z.object({
  // 絞り込み対象の業者 id。壊れた値（手打ち・古いブックマーク等）は絞り込み無しに倒す
  v: z.string().regex(UUID_SHAPE).optional().catch(undefined),
  // 表示中の月 'YYYY-MM'。無ければ今月（JST）。壊れた値は今月に倒す
  m: z.string().regex(MONTH_SHAPE).optional().catch(undefined),
})

/**
 * JST の今日 / 今月。calendar.tsx の todayKeyJst と同じ理由でローカルに計算する
 * （server/events.ts の nowJstIso をここで import すると、そちらが import する getDb 等が
 * クライアントバンドルに含まれてしまう懸念があるため。settings.tsx が members 絡みで
 * 同じ理由から回避しているのと同じパターン）。
 */
function todayKeyJst(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`
}

function currentMonthJst(): string {
  return todayKeyJst().slice(0, 7)
}

/** 'YYYY-MM' の初日〜末日（どちらも 'YYYY-MM-DD'） */
function monthRange(month: string): { from: string; to: string } {
  const start = dayjs(`${month}-01T00:00:00`)
  return { from: start.format('YYYY-MM-DD'), to: start.endOf('month').format('YYYY-MM-DD') }
}

/** 'YYYY-MM' を n か月ずらす（負数で過去へ） */
function shiftMonth(month: string, delta: number): string {
  return dayjs(`${month}-01T00:00:00`).add(delta, 'month').format('YYYY-MM')
}

/** 'YYYY-MM' を '2026年9月' に直す */
function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-')
  return `${year}年${Number(m)}月`
}

export const Route = createFileRoute('/news')({
  component: Page,
  validateSearch: (s) => newsSearchSchema.parse(s),
  loaderDeps: ({ search }) => ({ v: search.v, m: search.m }),
  loader: async ({ deps }) => {
    const month = deps.m ?? currentMonthJst()
    const { from, to } = monthRange(month)
    const [{ news }, { sources }] = await Promise.all([
      listVendorNews({ data: { vendorId: deps.v, from, to, limit: MONTH_LIMIT, offset: 0 } }),
      newsSources(),
    ])
    // 「今日」はサーバー側で決める（終わった日程のお知らせの色を落とす基準。
    // クライアントの時計に依らせない）
    return { news, sources, month, todayKey: todayKeyJst() }
  },
})

function Page() {
  const { news, sources, month, todayKey } = Route.useLoaderData()
  const { v } = Route.useSearch()
  const navigate = useNavigate({ from: '/news' })
  const range = monthRange(month)
  // 今月より先（未来の月）へは進めない。今月そのものは見られる（「次の月」は今月を
  // 表示しているときだけ無効にする）
  const canGoNext = month < currentMonthJst()

  function goToMonth(next: string) {
    navigate({ search: (s) => ({ ...s, m: next }), replace: true })
  }

  return (
    <PageShell title="お知らせ">
      <Stack gap="md">
        {sources.length > 0 ? (
          <Chip.Group
            value={v ?? null}
            onChange={(next) =>
              navigate({
                search: (s) => ({ ...s, v: (next as string) || undefined }),
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

        <Group justify="space-between" wrap="nowrap">
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<ChevronLeft size={16} aria-hidden />}
            onClick={() => goToMonth(shiftMonth(month, -1))}
          >
            前の月
          </Button>
          <Text fw={700}>{formatMonthLabel(month)}</Text>
          <Button
            variant="subtle"
            size="compact-sm"
            rightSection={<ChevronRight size={16} aria-hidden />}
            disabled={!canGoNext}
            onClick={() => goToMonth(shiftMonth(month, 1))}
          >
            次の月
          </Button>
        </Group>

        <NewsAgenda
          items={news}
          rangeStart={range.from}
          rangeEnd={range.to}
          emptyLabel="この月のお知らせはありません"
          todayKey={todayKey}
        />
      </Stack>
    </PageShell>
  )
}
