import { Button, Chip, Group, Stack, Text } from '@mantine/core'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { z } from 'zod'

import { PageShell } from '../components/PageShell'
import { NewsAgenda } from '../components/news/NewsAgenda'
import { formatMonthSlash } from '../lib/calendar'
import { UUID_SHAPE } from '../lib/ids'
import { listVendorNews, newsSources } from '../server/news'

/** Safety cap for 1 month ("load more" paging was removed in fix round 1. Normally not reached) */
const MONTH_LIMIT = 200

const MONTH_SHAPE = /^\d{4}-\d{2}$/

const newsSearchSchema = z.object({
  // The vendor id to filter by. A broken value (hand typed, old bookmark, etc.) falls back to no filter
  v: z.string().regex(UUID_SHAPE).optional().catch(undefined),
  // The month on display, 'YYYY-MM'. The current month (JST) when absent. A broken value falls
  // back to the current month
  m: z.string().regex(MONTH_SHAPE).optional().catch(undefined),
})

/**
 * Today / the current month in JST. Computed locally for the same reason as todayKeyJst in
 * calendar.tsx (importing nowJstIso of server/events.ts here risks pulling getDb and others
 * that it imports into the client bundle. The same pattern as settings.tsx, which avoids it
 * around members for the same reason).
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

/** First day to last day of 'YYYY-MM' (both as 'YYYY-MM-DD') */
function monthRange(month: string): { from: string; to: string } {
  const start = dayjs(`${month}-01T00:00:00`)
  return { from: start.format('YYYY-MM-DD'), to: start.endOf('month').format('YYYY-MM-DD') }
}

/** Shifts 'YYYY-MM' by n months (negative goes to the past) */
function shiftMonth(month: string, delta: number): string {
  return dayjs(`${month}-01T00:00:00`).add(delta, 'month').format('YYYY-MM')
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
    // "Today" is decided on the server (the reference for dimming vendor news whose dates have
    // passed. It must not depend on the client clock)
    return { news, sources, month, todayKey: todayKeyJst() }
  },
})

function Page() {
  const { news, sources, month, todayKey } = Route.useLoaderData()
  const { v } = Route.useSearch()
  const navigate = useNavigate({ from: '/news' })
  const range = monthRange(month)
  // Cannot go beyond the current month (future months). The current month itself can be viewed
  // ("次の月" (Next month) is disabled only while the current month is displayed)
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
          <Text fw={700}>{formatMonthSlash(month)}</Text>
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
