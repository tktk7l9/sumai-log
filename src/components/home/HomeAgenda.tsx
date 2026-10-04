import { Stack, Title, UnstyledButton } from '@mantine/core'
import { AgendaView } from '@mantine/schedule'
import type { AgendaViewProps, ScheduleEventData } from '@mantine/schedule'
import { useNavigate } from '@tanstack/react-router'

import { dateKey, formatDateWithWeekday } from '../../lib/calendar'
import { isWithinWeek } from '../../lib/freshness'
import { toScheduleEvents, type OwnEventPayload } from '../../lib/scheduleEvents'
import { SCHEDULE_LABELS_JA } from '../../lib/scheduleLabels'
import type { EventWithLinks } from '../../server/repository'
import { ThisWeekBadge } from '../FreshBadge'

/**
 * "これからの予定" (Upcoming events) on the home page. Shows **all** events from today
 * onward as an agenda (owner's request, 2026-09-21; before that it was only 4 weeks).
 * The range (rangeStart/rangeEnd) is the agendaFrom/agendaTo returned by listHomeEvents,
 * passed as is (not recalculated here).
 *
 * Among today's events, those whose time has already passed are dimmed
 * (`toScheduleEvents` makes the color gray and sets payload.past. The row text color is
 * dimmed by `.mantine-AgendaView-agendaViewEvent[data-past]` in styles.css).
 */
export function HomeAgenda({
  events,
  rangeStart,
  rangeEnd,
  nowIso,
}: {
  events: EventWithLinks[]
  rangeStart: string
  rangeEnd: string
  /** "Now" (JST). The reference for dimming events that have ended */
  nowIso: string
}) {
  const navigate = useNavigate()
  const scheduleEvents = toScheduleEvents(events, nowIso)

  function handleEventClick(event: ScheduleEventData) {
    const payload = event.payload as OwnEventPayload | undefined
    const found = payload ? events.find((e) => e.id === payload.eventId) : undefined
    const key = found ? dateKey(found.startsAt) : dateKey(String(event.start))
    navigate({ to: '/calendar', search: { m: key.slice(0, 7), d: key } })
  }

  // Use the default row content (rootProps.children) as is, add data-past only to rows of
  // events that have ended (the text color is dimmed in CSS), and "今週" to events of the
  // next 7 days
  const todayKey = dateKey(nowIso)
  const renderEvent: AgendaViewProps['renderEvent'] = (event, rootProps) => {
    const payload = event.payload as OwnEventPayload | undefined
    const thisWeek = isWithinWeek(String(event.start), todayKey)
    return (
      <UnstyledButton
        {...rootProps}
        data-past={payload?.past ? true : undefined}
        data-this-week={thisWeek ? true : undefined}
      >
        {rootProps.children}
        {thisWeek ? (
          <span className="home-agenda-tag">
            <ThisWeekBadge size="sm" />
          </span>
        ) : null}
      </UnstyledButton>
    )
  }

  return (
    <Stack gap="sm">
      <Title order={2}>これからの予定</Title>
      <AgendaView
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        events={scheduleEvents}
        locale="ja"
        labels={SCHEDULE_LABELS_JA}
        // The date AgendaView passes is 'YYYY-MM-DD HH:mm:ss' (in effect 'YYYY-MM-DD').
        // Cut out the date part with dateKey and match the format of the next event
        // (formatDateWithWeekday)
        dateHeaderFormat={(date) => formatDateWithWeekday(dateKey(date))}
        // A range header such as "9/19 – 10/16" is not needed (owner's request, 2026-09-19).
        // headerFormat cannot remove it (it is always joined as `${start} – ${end}`), so
        // hide it with the Styles API
        styles={{ agendaViewHeader: { display: 'none' } }}
        renderEvent={renderEvent}
        onEventClick={handleEventClick}
      />
    </Stack>
  )
}
