import { Button, Group, Stack, Text, Title } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { AgendaView, Schedule } from '@mantine/schedule'
import type { ScheduleEventData, ScheduleViewLevel } from '@mantine/schedule'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'

import { EventForm } from '../components/calendar/EventForm'
import { DeleteSection } from '../components/DetailActions'
import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { NewsEventDrawer } from '../components/news/NewsEventDrawer'
import { PageShell } from '../components/PageShell'
import { deleteWithUndo, usePendingDeletes } from '../components/undoableDelete'
import { extractErrorMessage } from '../lib/formError'
import { dateKey, formatDateSlash, formatDateWithWeekday, formatMonthSlash } from '../lib/calendar'
import { dayOfWeek, holidayName } from '../lib/holidays'
import { planEventDefaults } from '../lib/news/planDefaults'
import { newsToScheduleEvents, toScheduleEvents, type CalendarPayload } from '../lib/scheduleEvents'
import { SCHEDULE_LABELS_JA } from '../lib/scheduleLabels'
import { deleteEvent, listEventsBetween } from '../server/events'
import { getVendorNews, linkNewsToEvent, newsEventsBetween } from '../server/news'
import { listLinkTargets, listPlaces } from '../server/places'
import type { EventWithLinks, NewsEventRow } from '../server/repository'

const search = z.object({
  // The month on display, 'YYYY-MM'. The current month when absent
  m: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  // The selected day, 'YYYY-MM-DD'
  d: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  // The view on display. The year view can be picked from the header but is not kept in the URL
  v: z.enum(['day', 'week', 'month']).optional(),
  // When arriving from "行く" (Go) on a vendor news item: open the event form with that news
  // item as the initial values
  plan: z.string().uuid().optional(),
})

export const Route = createFileRoute('/calendar')({
  component: Page,
  validateSearch: (s) => search.parse(s),
  loaderDeps: ({ search }) => ({ m: search.m, d: search.d, v: search.v, plan: search.plan }),
  loader: async ({ deps }) => {
    // Decide "today" on the server (independent of the client clock)
    const date = deps.d ?? (deps.m ? `${deps.m}-01` : todayKeyJst())
    const view = deps.v ?? 'month'
    const { from, to } = visibleRange(date, view)
    const [range, targets, places, news, planNews] = await Promise.all([
      listEventsBetween({ data: { from, to } }),
      listLinkTargets(),
      listPlaces(),
      // For the information layer. Fetch with the same from/to as the display range that spills
      // across months (visibleRange) (cutting by month would miss the information for the weeks
      // where the month view spills over before and after)
      newsEventsBetween({ data: { from, to } }),
      deps.plan ? getVendorNews({ data: { id: deps.plan } }).then((r) => r.news) : null,
    ])
    // range also contains nowIso / todayKey returned by listEventsBetween (the "now" decided by
    // the server). Used as the reference for dimming finished events and vendor news whose dates
    // have passed
    return { ...range, targets, places, date, newsEvents: news.news, planNews }
  },
})

/** The last day of the month of `key` ('YYYY-MM-DD') */
function monthEnd(key: string): string {
  return dayjs(`${key.slice(0, 7)}-01T00:00:00`)
    .endOf('month')
    .format('YYYY-MM-DD')
}

function todayKeyJst(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`
}

/**
 * Returns the range the view can actually render. The week view can span months, so
 * this computes the actual date range directly instead of "only the displayed month".
 */
function visibleRange(date: string, view: 'day' | 'week' | 'month'): { from: string; to: string } {
  const base = dayjs(`${date}T00:00:00`)
  if (view === 'day') return { from: date, to: date }
  if (view === 'week') {
    // Weeks start on Monday
    const mondayOffset = (base.day() + 6) % 7
    const start = base.subtract(mondayOffset, 'day')
    return { from: start.format('YYYY-MM-DD'), to: start.add(6, 'day').format('YYYY-MM-DD') }
  }
  // The month view takes a slightly wider range to cover the weeks that spill over before and after
  const start = base.startOf('month').subtract(7, 'day')
  const end = base.endOf('month').add(7, 'day')
  return { from: start.format('YYYY-MM-DD'), to: end.format('YYYY-MM-DD') }
}

function Page() {
  const { events, targets, places, date, newsEvents, planNews, nowIso, todayKey } =
    Route.useLoaderData()
  const { d, v } = Route.useSearch()
  const navigate = useNavigate({ from: '/calendar' })
  const router = useRouter()
  const remove = useServerFn(deleteEvent)
  const linkNews = useServerFn(linkNewsToEvent)
  const [editing, setEditing] = useState<EventWithLinks | null>(null)
  const [creating, setCreating] = useState(false)
  // The information layer drawer holds only the id (the news itself is looked up again from
  // the loader data every time). This way, when newsEvents is refreshed by router.invalidate()
  // after "行く", the same drawer stays open and naturally switches to the latest news with
  // plannedEventId, and the button changes from "行く" to "予定を見る" (View event).
  const [newsDrawerNewsId, setNewsDrawerNewsId] = useState<string | null>(null)
  // 'year' is not kept in the URL (it is not in the search schema of v), so even when it is
  // picked from the header only the display is switched, through local state
  const [view, setView] = useState<ScheduleViewLevel>(v ?? 'month')
  // On mobile the height of 1 cell of the month view has to be tightened (owner's report,
  // 2026-09-16. See the matching comment in styles.css). Reducing the number of events shown
  // per day from 2 to 1 makes Mantine itself lower `--month-view-max-events` accordingly, and
  // the height tightens too (the CSS side does not override this variable directly because it
  // would drift from the number of events actually rendered). Desktop (sm and up) keeps the
  // default of 2
  const isMobile = useMediaQuery('(max-width: 47.99em)', true)

  useEffect(() => {
    setView(v ?? 'month')
  }, [v])

  // Finished events drop the colour of their kind and turn grey (toScheduleEvents), and vendor
  // news whose dates have passed set payload.past to dim the text colour (renderEventBody below).
  // Owner's request (2026-09-21)
  const pendingDeletes = usePendingDeletes()
  const scheduleEvents = useMemo<ScheduleEventData<CalendarPayload>[]>(
    () => [
      ...toScheduleEvents(
        events.filter((e) => !pendingDeletes.has(e.id)),
        nowIso,
      ),
      ...newsToScheduleEvents(newsEvents, todayKey),
    ],
    [events, newsEvents, nowIso, todayKey, pendingDeletes],
  )
  const selected = d ?? date
  const newsDrawerNews = newsDrawerNewsId
    ? (newsEvents.find((n) => n.id === newsDrawerNewsId) ?? null)
    : null

  function navigateToDay(next: string) {
    // The Schedule callback is typed as 'YYYY-MM-DD' but actually arrives as 'YYYY-MM-DD HH:mm:ss',
    // so take only the date part before putting it into search (as is, validateSearch fails)
    navigate({ search: (s) => ({ ...s, d: dateKey(next) }), replace: true })
  }

  function handleViewChange(next: ScheduleViewLevel) {
    setView(next)
    if (next === 'day' || next === 'week' || next === 'month') {
      navigate({ search: (s) => ({ ...s, v: next }), replace: true })
    }
  }

  function handleEventClick(ev: ScheduleEventData) {
    const payload = ev.payload as CalendarPayload | undefined
    if (!payload) return
    if (payload.kind === 'own') {
      const found = events.find((e) => e.id === payload.eventId)
      if (found) setEditing(found)
      return
    }
    setNewsDrawerNewsId(payload.newsId)
  }

  function handleDelete(e: EventWithLinks) {
    setEditing(null)
    deleteWithUndo({
      id: e.id,
      message: `「${e.title}」を削除しました`,
      commit: async () => {
        await remove({ data: { id: e.id } })
        await router.invalidate()
      },
    })
  }

  function goToday() {
    const key = todayKey
    navigate({ search: (s) => ({ ...s, m: key.slice(0, 7), d: key }), replace: true })
  }

  /**
   * "行く" in the vendor news drawer. Does not create at once; adds ?plan= and opens the event
   * form filled with the initial values
   */
  function handlePlanVisit(news: NewsEventRow) {
    setNewsDrawerNewsId(null)
    navigate({ search: (s) => ({ ...s, plan: news.id }), replace: true })
  }

  // The event form reached from "行く" (?plan=). Initial values come from planEventDefaults.
  // plan is removed on close
  const planDefaults = planNews ? planEventDefaults(planNews) : null
  function closePlan() {
    navigate({ search: (s) => ({ ...s, plan: undefined }), replace: true })
  }
  async function handlePlanSaved(eventId: string) {
    if (!planNews) return
    try {
      await linkNews({ data: { newsId: planNews.id, eventId } })
      await router.invalidate()
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
    }
    closePlan()
  }

  /**
   * "予定を見る" in the vendor news drawer ("行く" already done). Goes to the edit drawer of
   * the couple's own event
   */
  function handleViewPlannedEvent(news: NewsEventRow) {
    setNewsDrawerNewsId(null)
    const found = news.plannedEventId ? events.find((e) => e.id === news.plannedEventId) : undefined
    if (found) setEditing(found)
    else if (news.eventStart) navigateToDay(news.eventStart)
  }

  /** The body of an event. Finished ones get a dimmed text colour (color decides the background) */
  function renderEventBody(event: ScheduleEventData) {
    const payload = event.payload as CalendarPayload | undefined
    return (
      <Text span inherit c={payload?.past ? 'dimmed' : undefined}>
        {event.title}
      </Text>
    )
  }

  // Japanese calendars colour Saturday blue and Sunday / holidays red (SHIG 71). Mantine's
  // weekendDays paints both red, so Saturday that is not a holiday gets its own class
  function dayProps(key: string) {
    const name = holidayName(key)
    if (name) return { style: { color: 'var(--mantine-color-red-6)' }, title: name }
    return dayOfWeek(dateKey(key)) === 6 ? { className: 'is-saturday' } : {}
  }

  return (
    <PageShell title="予定" titleHidden fab>
      <Stack gap="md">
        {/* The Schedule header drops "今日" (Today) at phone width; offer it here (SHIG 42) */}
        {isMobile ? (
          <Button variant="default" size="xs" onClick={goToday} style={{ alignSelf: 'flex-end' }}>
            今日
          </Button>
        ) : null}
        <Schedule
          date={date}
          onDateChange={(next) => {
            const key = dateKey(next)
            navigate({ search: (s) => ({ ...s, m: key.slice(0, 7), d: key }), replace: true })
          }}
          view={view}
          onViewChange={handleViewChange}
          events={scheduleEvents}
          labels={SCHEDULE_LABELS_JA}
          // Mobile uses the same views as PC (month/week/day) (owner's request, 2026-09-16).
          // With 'responsive' it switched to MobileMonthView at phone width and looked different
          // from PC. With layout="default" the normal views such as monthViewProps are always
          // used, so mobileMonthViewProps, which is only for 'responsive', is not needed (it is
          // not used even when passed)
          layout="default"
          mode="default"
          onDayClick={(next) => navigateToDay(next)}
          onEventClick={handleEventClick}
          renderEventBody={renderEventBody}
          monthViewProps={{
            firstDayOfWeek: 1,
            weekendDays: [0, 6],
            highlightToday: true,
            getDayProps: dayProps,
            maxEventsPerDay: isMobile ? 1 : 2,
            // All heading dates are unified to YYYY/MM/DD (owner's request, 2026-09-23). Months use YYYY/MM
            monthYearSelectProps: { labelFormat: 'YYYY/MM' },
          }}
          weekViewProps={{
            startTime: '07:00:00',
            endTime: '22:00:00',
            intervalMinutes: 30,
            // The default is "9月 21 – 9月 27, 2026"
            renderWeekLabel: ({ weekStart, weekEnd }) =>
              `${formatDateSlash(weekStart)} – ${formatDateSlash(weekEnd)}`,
          }}
          dayViewProps={{
            startTime: '07:00:00',
            endTime: '22:00:00',
            intervalMinutes: 30,
            // The default is "9月 23, 2026"
            headerFormat: (d) => formatDateWithWeekday(dateKey(d)),
          }}
        />
        {/* At phone width the month grid can show only 2-3 characters of a title, so the month
            is also listed below with full titles (SHIG 28). The grid itself stays, as the
            owner asked for the same views as on PC (2026-09-16) */}
        {isMobile && view === 'month' ? (
          <Stack gap="xs">
            <Title order={2} size="h4">
              {formatMonthSlash(selected.slice(0, 7))} の予定
            </Title>
            <AgendaView
              rangeStart={`${selected.slice(0, 7)}-01`}
              rangeEnd={monthEnd(selected)}
              events={scheduleEvents}
              locale="ja"
              labels={SCHEDULE_LABELS_JA}
              dateHeaderFormat={(d) => formatDateWithWeekday(dateKey(d))}
              styles={{ agendaViewHeader: { display: 'none' } }}
              onEventClick={handleEventClick}
            />
          </Stack>
        ) : null}
        <Group gap="sm" wrap="wrap">
          <Group gap={6} wrap="nowrap">
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                display: 'inline-block',
                backgroundColor: 'var(--mantine-color-clay-6)',
              }}
            />
            <Text size="xs" c="dimmed">
              自分たちの予定
            </Text>
          </Group>
          <Group gap={6} wrap="nowrap">
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                display: 'inline-block',
                backgroundColor: 'var(--mantine-color-gray-5)',
              }}
            />
            <Text size="xs" c="dimmed">
              終わった予定
            </Text>
          </Group>
          <Group gap={6} wrap="nowrap">
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                display: 'inline-block',
                border: '1px solid var(--mantine-color-gray-6)',
              }}
            />
            <Text size="xs" c="dimmed">
              お知らせ（情報）
            </Text>
          </Group>
        </Group>
      </Stack>

      <Fab label="予定を追加" onClick={() => setCreating(true)} />
      <FormDrawer opened={creating} onClose={() => setCreating(false)} title="予定を追加">
        <EventForm
          event={null}
          defaults={{ date: selected }}
          targets={targets}
          places={places}
          onSaved={() => setCreating(false)}
        />
      </FormDrawer>
      <FormDrawer opened={planDefaults !== null} onClose={closePlan} title="予定を追加">
        {planDefaults ? (
          <EventForm
            event={null}
            defaults={planDefaults}
            targets={targets}
            places={places}
            onSaved={handlePlanSaved}
          />
        ) : null}
      </FormDrawer>
      <FormDrawer opened={editing !== null} onClose={() => setEditing(null)} title="予定を編集">
        {editing ? (
          <Stack gap="md">
            <EventForm
              event={editing}
              targets={targets}
              places={places}
              onSaved={() => setEditing(null)}
            />
            <DeleteSection label="この予定を削除" onDelete={() => handleDelete(editing)} />
          </Stack>
        ) : null}
      </FormDrawer>
      <FormDrawer
        opened={newsDrawerNews !== null}
        onClose={() => setNewsDrawerNewsId(null)}
        title="お知らせ"
      >
        {newsDrawerNews ? (
          <NewsEventDrawer
            news={newsDrawerNews}
            planning={false}
            onPlan={() => handlePlanVisit(newsDrawerNews)}
            onViewEvent={() => handleViewPlannedEvent(newsDrawerNews)}
          />
        ) : null}
      </FormDrawer>
    </PageShell>
  )
}
