import { Button, Chip, Group, SegmentedControl, Stack, Text } from '@mantine/core'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { z } from 'zod'

import { PageShell } from '../components/PageShell'
import { MailNewsList, type MailNewsSearch } from '../components/news/MailNewsList'
import { NewsAgenda } from '../components/news/NewsAgenda'
import { formatMonthSlash } from '../lib/calendar'
import { UUID_SHAPE } from '../lib/ids'
import type { NewsEventRow } from '../server/repository'
import { listNewsletters, listVendorNews, newsSources } from '../server/news'
import { MAIL_NEWS_PAGE } from '../server/news.schema'
import { getMembers } from '../server/settings'

/** Safety cap for 1 month ("load more" paging was removed in fix round 1. Normally not reached) */
const MONTH_LIMIT = 200

const MONTH_SHAPE = /^\d{4}-\d{2}$/

const newsSearchSchema = z.object({
  // 'mail' = the newsletters (every month, with the read flag). Absent = the monthly list
  tab: z.literal('mail').optional().catch(undefined),
  // The vendor id to filter by. A broken value (hand typed, old bookmark, etc.) falls back to no filter
  v: z.string().regex(UUID_SHAPE).optional().catch(undefined),
  // The month on display, 'YYYY-MM'. The current month (JST) when absent. A broken value falls
  // back to the current month
  m: z.string().regex(MONTH_SHAPE).optional().catch(undefined),
  // Newsletters tab: only the unread ones
  unread: z.literal(true).optional().catch(undefined),
  // Newsletters tab: how many rows are shown (grows with 「さらに表示」)
  n: z.number().int().min(1).max(1000).optional().catch(undefined),
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
  // The monthly list and the newsletters are different queries, so only the keys of the
  // shown tab reach the loader (switching the unread chip does not reload the month)
  loaderDeps: ({ search }) =>
    search.tab === 'mail'
      ? { tab: 'mail' as const, v: search.v, unread: search.unread, n: search.n }
      : { tab: 'month' as const, v: search.v, m: search.m },
  loader: async ({ deps }) => {
    // "Today" is decided on the server (the reference for dimming vendor news whose dates have
    // passed. It must not depend on the client clock)
    const todayKey = todayKeyJst()
    if (deps.tab === 'mail') {
      const limit = deps.n ?? MAIL_NEWS_PAGE
      const [mail, { members }] = await Promise.all([
        listNewsletters({ data: { vendorId: deps.v, unreadOnly: deps.unread, limit } }),
        getMembers(),
      ])
      return { tab: 'mail' as const, mail, members, limit, todayKey }
    }
    const month = deps.m ?? currentMonthJst()
    const { from, to } = monthRange(month)
    const [{ news }, { sources }] = await Promise.all([
      listVendorNews({ data: { vendorId: deps.v, from, to, limit: MONTH_LIMIT, offset: 0 } }),
      newsSources(),
    ])
    return { tab: 'month' as const, news, sources, month, todayKey }
  },
})

function Page() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/news' })

  function setSearch(patch: Partial<MailNewsSearch>) {
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true })
  }

  return (
    <PageShell title="お知らせ">
      <Stack gap="md">
        {/* The vendor filter and the row count belong to one tab, so switching drops them;
            the month stays for the way back */}
        <SegmentedControl
          aria-label="見るもの"
          value={search.tab ?? 'month'}
          onChange={(v) =>
            void navigate({
              search: (s) => ({
                m: s.m,
                tab: v === 'mail' ? ('mail' as const) : undefined,
              }),
              replace: true,
            })
          }
          data={[
            { value: 'month', label: '月ごと' },
            { value: 'mail', label: 'メルマガ' },
          ]}
        />
        {data.tab === 'mail' ? (
          <MailNewsList
            news={data.mail.news}
            vendors={data.mail.vendors}
            members={data.members}
            search={search}
            setSearch={setSearch}
            todayKey={data.todayKey}
            limit={data.limit}
          />
        ) : (
          <MonthPanel
            news={data.news}
            sources={data.sources}
            month={data.month}
            todayKey={data.todayKey}
            vendorId={search.v}
          />
        )}
      </Stack>
    </PageShell>
  )
}

/** The monthly list (the default tab): one month of vendor news, one vendor or all */
function MonthPanel({
  news,
  sources,
  month,
  todayKey,
  vendorId: v,
}: {
  news: NewsEventRow[]
  sources: { id: string; name: string }[]
  month: string
  todayKey: string
  vendorId: string | undefined
}) {
  const navigate = useNavigate({ from: '/news' })
  const range = monthRange(month)
  // Cannot go beyond the current month (future months). The current month itself can be viewed
  // ("次の月" (Next month) is disabled only while the current month is displayed)
  const canGoNext = month < currentMonthJst()

  function goToMonth(next: string) {
    navigate({ search: (s) => ({ ...s, m: next }), replace: true })
  }

  return (
    <>
      <Stack gap="md">
        {sources.length > 0 ? (
          // A single-choice chip group cannot be unticked, so "すべて" (All) is the way back
          // from one vendor to every vendor (same as the status chips of the candidates list;
          // SHIG 60). It is not a vendor id, so it is not kept in search
          <Chip.Group
            value={v ?? 'all'}
            onChange={(next) =>
              navigate({
                search: (s) => ({ ...s, v: next === 'all' ? undefined : (next as string) }),
                replace: true,
              })
            }
          >
            <Group gap={6}>
              <Chip value="all" size="xs">
                すべて
              </Chip>
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
    </>
  )
}
