import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '../db/client'
import { events } from '../db/schema'
import { dateKey, monthKeys } from '../lib/calendar'
import { pendingVisitEvents } from '../lib/pending'
import { eventInput } from './events.schema'
import { currentActorEmail } from './members'
import {
  deleteEvent as deleteEventRow,
  listEventsWithLinks,
  listRecordedEventIds,
  upsertEvent,
  saveOrConflict,
} from './repository'
import { dateField, idInput } from './zod'

// eventInput comes from events.schema.ts (see there for why it was split for the sake of tests).
// The public import path (eventInput/EventInput available from './events') does not change.
export { eventInput }
export type { EventInput } from './events.schema'

/**
 * The de facto maximum date key. Event dates are TEXT 'YYYY-MM-DD', so passing this as
 * the upper bound of between means the same as "no upper bound".
 */
const MAX_DATE_KEY = '9999-12-31'

/** "Now". An ISO string in JST (the Worker runs in UTC, so add +9h and format) */
export function nowJstIso(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return `${d.toISOString().slice(0, 19)}+09:00`
}

export const listMonthEvents = createServerFn()
  .validator(
    z.object({
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb()
    const keys = monthKeys(data.year, data.month)
    const [rows, recorded] = await Promise.all([
      listEventsWithLinks(db, keys[0], keys[keys.length - 1]),
      listRecordedEventIds(db),
    ])
    const now = nowJstIso()
    return {
      events: rows,
      recordedEventIds: [...recorded],
      todayKey: dateKey(now),
      nowIso: now,
    }
  })

/**
 * For the events tab (Mantine Schedule). Fetches any period that the day/week/month views may
 * span. Unlike listMonthEvents it receives the date range itself instead of a year and month.
 */
export const listEventsBetween = createServerFn()
  .validator(z.object({ from: dateField, to: dateField }))
  .handler(async ({ data }) => {
    const db = getDb()
    const [rows, recorded] = await Promise.all([
      listEventsWithLinks(db, data.from, data.to),
      listRecordedEventIds(db),
    ])
    const now = nowJstIso()
    return {
      events: rows,
      recordedEventIds: [...recorded],
      todayKey: dateKey(now),
      nowIso: now,
    }
  })

export const getEvent = createServerFn()
  .validator(idInput)
  .handler(async ({ data }) => {
    const [event] = await getDb().select().from(events).where(eq(events.id, data.id)).limit(1)
    if (!event) throw new Response('Not Found', { status: 404 })
    return { event }
  })

export const saveEvent = createServerFn({ method: 'POST' })
  .validator(eventInput)
  .handler(async ({ data }) =>
    saveOrConflict(async () => upsertEvent(getDb(), data, await currentActorEmail())),
  )

export const deleteEvent = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    await deleteEventRow(getDb(), data.id)
    return { ok: true as const }
  })

/**
 * For the home page: "記録を書きませんか" (Write a record?) and the upcoming events (agenda).
 * The agenda returns **all events from today on, without cutting by period** (owner's
 * request, 2026-09-21. Until then it was only the 4 weeks from today to +27 days). "次の予定"
 * (Next event) overlapped with the agenda and was removed on 2026-09-19.
 *
 * No upper bound is set on the future side, so the query range is also fetched without an
 * upper bound (MAX_DATE_KEY). Date keys are compared as 'YYYY-MM-DD' strings, so passing the
 * de facto maximum as the upper bound makes it unlimited. These are the events of two people,
 * so the count is a few dozen at most, and narrowing is done just by filtering the rows
 * already fetched (the same range is not queried from the DB twice).
 */
export const listHomeEvents = createServerFn().handler(async () => {
  const db = getDb()
  const now = nowJstIso()
  const today = dateKey(now)
  // For "記録を書きませんか" looking at the past 90 days is enough. No upper bound on the future side
  const from = dateKey(new Date(Date.parse(today) - 90 * 86400000).toISOString())
  const [rows, recorded] = await Promise.all([
    listEventsWithLinks(db, from, MAX_DATE_KEY),
    listRecordedEventIds(db),
  ])
  const agendaFrom = today
  const agenda = rows.filter((e) => dateKey(e.startsAt) >= agendaFrom)
  return {
    pending: pendingVisitEvents(rows, recorded, now).slice(0, 5),
    agenda,
    agendaFrom,
    // AgendaView does not render events that fall outside rangeStart to rangeEnd, so the end
    // is set to "the day of the last event" (endsAt is checked too, so that events whose end
    // date is after the start date are not cut off). With no events it is an empty range of
    // today only
    agendaTo: agendaEnd(agenda, agendaFrom),
    nowIso: now,
  }
})

/** The rangeEnd of the agenda. With no events it is from (= today) itself */
function agendaEnd(agenda: readonly { startsAt: string; endsAt: string | null }[], from: string) {
  let end = from
  for (const e of agenda) {
    const last = dateKey(e.endsAt ?? e.startsAt)
    if (last > end) end = last
  }
  return end
}
