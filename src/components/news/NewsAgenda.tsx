import { Badge, Group, Stack, Text, UnstyledButton } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { dateKey, formatDateSlash, formatDateWithWeekday } from '../../lib/calendar'
import { isMailNews } from '../../lib/mail/toNews'
import { groupNewsByDate } from '../../lib/scheduleEvents'
import type { NewsEventRow } from '../../server/repository'
import { EventBadge } from './EventBadge'
import { FormDrawer } from '../FormDrawer'
import { NewsEventDrawer } from './NewsEventDrawer'

/**
 * The date range shown in the header (YYYY/MM/DD – YYYY/MM/DD). With 0 items it only
 * appears above "お知らせはありません" (No vendor news) and carries no meaning, so the date
 * at call time is used.
 * Not used when the caller passes an explicit rangeStart/rangeEnd (the monthly agenda of
 * /news, which wants to pass the first to the last day of the month = a fixed range that
 * does not depend on the item count).
 */
function agendaRange(items: readonly NewsEventRow[]): { start: string; end: string } {
  if (items.length === 0) {
    const today = dateKey(new Date().toISOString())
    return { start: today, end: today }
  }
  let start = items[0].publishedOn
  let end = items[0].publishedOn
  for (const item of items) {
    if (item.publishedOn < start) start = item.publishedOn
    if (item.publishedOn > end) end = item.publishedOn
  }
  return { start, end }
}

/**
 * The vendor news list shared by the home page and `/news` (owner's request, 2026-09-16).
 * Puts a heading per publish date and lists **newer days on top** (2026-09-24. It used to
 * use AgendaView of @mantine/schedule, but that lists dates fixed in oldest-first order
 * and has no setting to change the order, so this is built by hand). A row is kept as a
 * read-only display of "vendor name (dimmed) + title + event badge + (if already planned)
 * the "予定あり" (Has event) badge", and clicking it opens `NewsEventDrawer`
 * ("行く" (Go) / "予定を見る" (See event)). The go action itself is unified inside this
 * drawer (so that the button sits in the same place on both the home page and `/news`).
 *
 * When `rangeStart`/`rangeEnd` are omitted, the range is the same as on the home page:
 * "min/max of publishedOn of items". `/news` (monthly agenda, fix round 1) passes the
 * first/last day of that month explicitly, so that the month range appears in the header
 * even for a month with 0 items. Likewise `emptyLabel`, when omitted, is
 * "お知らせはありません" as on the home page, and `/news` passes
 * "この月のお知らせはありません" (No vendor news this month).
 *
 * When `todayKey` is passed, the row text color is dimmed for news whose event dates have
 * ended (the open house is over, etc.) (owner's request, 2026-09-21). News without event
 * dates has only a publish date, and the publish date is always in the past, so it is
 * not dimmed.
 */
export function NewsAgenda({
  items,
  rangeStart,
  rangeEnd,
  emptyLabel = 'お知らせはありません',
  hideHeader = false,
  todayKey,
}: {
  items: NewsEventRow[]
  rangeStart?: string
  rangeEnd?: string
  emptyLabel?: string
  /** When true, do not show a range header such as "9/18 – 9/18" (for the home page) */
  hideHeader?: boolean
  /** Today ('YYYY-MM-DD' in JST). The reference for dimming news whose dates have ended */
  todayKey?: string
}) {
  const navigate = useNavigate()
  const [drawerNewsId, setDrawerNewsId] = useState<string | null>(null)

  const groups = groupNewsByDate(items, todayKey)
  const range = rangeStart && rangeEnd ? { start: rangeStart, end: rangeEnd } : agendaRange(items)
  const drawerNews = drawerNewsId ? (items.find((n) => n.id === drawerNewsId) ?? null) : null

  /** "行く" in the drawer. Does not create immediately; opens the event form (with initial
   * values) in the calendar (?plan=). The button appears only for news with event dates
   * (planButtonState), so eventStart exists */
  function handlePlan(news: NewsEventRow) {
    setDrawerNewsId(null)
    const key = news.eventStart ?? news.publishedOn
    navigate({ to: '/calendar', search: { m: key.slice(0, 7), d: key, plan: news.id } })
  }

  /** "予定を見る" in the drawer ("行く" already done). Moves to that day in the calendar
   * (the same behavior NewsRow had in the old NewsList. There is no screen here to edit
   * EventForm, so editing the event itself is left to the calendar).
   * plannedEventId is set only on events that planVisitFromNews creates with eventStart
   * required (src/server/news.ts), so normally eventStart always exists too. Even so,
   * when there is a mismatch (data inconsistency etc.) where plannedEventId exists but
   * eventStart does not, avoid doing nothing just because the date cannot be identified,
   * and take the user to today's calendar (pointed out in fix round 1). */
  function handleViewEvent(news: NewsEventRow) {
    setDrawerNewsId(null)
    if (news.eventStart) {
      navigate({ to: '/calendar', search: { m: news.eventStart.slice(0, 7), d: news.eventStart } })
      return
    }
    navigate({ to: '/calendar' })
  }

  return (
    <>
      <div className="news-agenda">
        {hideHeader ? null : (
          <Text size="sm" c="dimmed" className="news-agenda-range">
            {formatDateSlash(range.start)} – {formatDateSlash(range.end)}
          </Text>
        )}
        {groups.length === 0 ? (
          <Text size="sm" c="dimmed" py="sm">
            {emptyLabel}
          </Text>
        ) : (
          groups.map((g) => (
            <section key={g.date} className="news-agenda-group">
              <Text size="sm" fw={600} className="news-agenda-date">
                {formatDateWithWeekday(g.date)}
              </Text>
              {g.items.map(({ news: item, past }) => (
                // For news whose dates have ended, the title is also dimmed to the secondary
                // color (the badge color does not change. Reading the date in
                // "見学会 2026/09/12(土)" (Open house, Sat) tells that it has ended)
                <UnstyledButton
                  key={item.id}
                  className="news-agenda-row"
                  data-past={past ? true : undefined}
                  onClick={() => setDrawerNewsId(item.id)}
                >
                  <Stack gap={4} py={8} px="sm">
                    <Text size="sm" c="dimmed">
                      {item.vendorName}
                    </Text>
                    <Text size="sm" fw={600} c={past ? 'dimmed' : undefined}>
                      {item.title}
                    </Text>
                    {item.eventKind || item.plannedEventId || isMailNews(item.url) ? (
                      <Group gap={6} wrap="wrap" align="center">
                        {isMailNews(item.url) ? (
                          <Badge size="xs" variant="outline" color="gray">
                            メール
                          </Badge>
                        ) : null}
                        <EventBadge
                          eventKind={item.eventKind}
                          eventStart={item.eventStart}
                          eventEnd={item.eventEnd}
                        />
                        {item.plannedEventId ? (
                          <Badge size="xs" variant="light">
                            予定あり
                          </Badge>
                        ) : null}
                      </Group>
                    ) : null}
                  </Stack>
                </UnstyledButton>
              ))}
            </section>
          ))
        )}
      </div>
      <FormDrawer
        opened={drawerNews !== null}
        onClose={() => setDrawerNewsId(null)}
        title="お知らせ"
      >
        {drawerNews ? (
          <NewsEventDrawer
            news={drawerNews}
            planning={false}
            onPlan={() => handlePlan(drawerNews)}
            onViewEvent={() => handleViewEvent(drawerNews)}
          />
        ) : null}
      </FormDrawer>
    </>
  )
}
