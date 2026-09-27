import type { ScheduleEventData } from '@mantine/schedule'

import type { EventWithLinks, NewsEventRow } from '../server/repository'
import { dateKey, splitStartsAt } from './calendar'

/** Calendar events are only our own events. There are no externally sourced events, so kind
 * is fixed. */
export type OwnEventPayload = { kind: 'own'; eventId: string; past: boolean }
/** Vendor news (the information layer). It does not become own until "行く" (Go) converts it
 * into our own event. */
export type NewsEventPayload = { kind: 'news'; newsId: string; past: boolean }
/** The payload of an event passed to Schedule is either our own event or vendor news */
export type CalendarPayload = OwnEventPayload | NewsEventPayload

const KIND_COLOR: Record<EventWithLinks['kind'], string> = {
  visit: 'clay',
  meeting: 'blue',
  viewing: 'teal',
  other: 'gray',
}

/**
 * The color of finished events (owner's request, 2026-09-21). Drops the kind color
 * (clay/blue/teal) and falls back to gray, so that they can be told apart from upcoming
 * events at a glance. `gray` is a key in the theme palette, so Mantine picks a foreground
 * color that is readable in both light and dark color schemes (specifying a shade such as
 * `'gray.4'` makes the background of the light variant the raw color and the text becomes
 * unreadable in dark, so the key is passed as is).
 */
export const PAST_EVENT_COLOR = 'gray'

/**
 * Aligns "now" ('YYYY-MM-DDTHH:MM:SS+09:00' from `nowJstIso()`, or a date-only
 * 'YYYY-MM-DD') to 'YYYY-MM-DD HH:mm:ss', the same as Schedule. Both are JST wall-clock
 * times, so in this shape a string comparison decides the order (no conversion to Date).
 */
export function toScheduleStamp(nowIso: string): string {
  const date = dateKey(nowIso)
  return `${date} ${nowIso.length > 10 ? nowIso.slice(11, 19) : '00:00:00'}`
}

/**
 * Whether a vendor news item is a finished event. Only news with dates
 * (eventStart/eventEnd) is considered, and news without dates is not treated as past
 * (because the publication date is always in the past). Through the whole end date it is
 * treated as not finished (it is past when earlier than todayKey).
 */
export function isPastNews(
  news: { eventStart: string | null; eventEnd: string | null },
  todayKey: string,
): boolean {
  if (!news.eventStart) return false
  return (news.eventEnd ?? news.eventStart) < todayKey
}

/** Returns the day after 'YYYY-MM-DD' as 'YYYY-MM-DD'. Used for the end of all-day events
 * and for calculations that cross midnight */
export function nextDay(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day + 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`
}

/** Adds 60 minutes to 'HH:MM'. When it crosses midnight, date also moves to the next day */
function plusOneHour(date: string, time: string): { date: string; time: string } {
  const [hour, minute] = time.split(':').map(Number)
  const total = hour * 60 + minute + 60
  const overflowsDay = total >= 24 * 60
  const rem = total % (24 * 60)
  const hh = String(Math.floor(rem / 60)).padStart(2, '0')
  const mm = String(rem % 60).padStart(2, '0')
  return { date: overflowsDay ? nextDay(date) : date, time: `${hh}:${mm}` }
}

/**
 * Converts events into ScheduleEventData of @mantine/schedule (pure function).
 *
 * All-day (allDay, or startsAt is date-only with no time) becomes
 * 'YYYY-MM-DD 00:00:00' through 'YYYY-MM-DD 00:00:00' of the next day.
 * Timed events use startsAt/endsAt as they are, and without endsAt the end is 60 minutes
 * after the start. When endsAt is set, eventInput (via composeStartsAt) guarantees that it
 * has a time, so the presence of a time is not re-checked here.
 *
 * When `nowIso` (the value of `nowJstIso()`) is passed, the color of finished events (the
 * end is before "now") falls back to `PAST_EVENT_COLOR`, and `past: true` is set on the
 * payload (owner's request, 2026-09-21). When omitted, everything is treated as upcoming.
 */
export function toScheduleEvents(
  events: readonly EventWithLinks[],
  nowIso?: string,
): ScheduleEventData<OwnEventPayload>[] {
  const nowStamp = nowIso ? toScheduleStamp(nowIso) : null
  return events.map((e) => {
    const date = dateKey(e.startsAt)
    const time = splitStartsAt(e.startsAt).time

    let start: string
    let end: string
    if (e.allDay || time === null) {
      start = `${date} 00:00:00`
      end = `${nextDay(date)} 00:00:00`
    } else {
      start = `${date} ${time}:00`
      if (e.endsAt) {
        const endDate = dateKey(e.endsAt)
        const endTime = splitStartsAt(e.endsAt).time as string
        end = `${endDate} ${endTime}:00`
      } else {
        const rolled = plusOneHour(date, time)
        end = `${rolled.date} ${rolled.time}:00`
      }
    }

    // Finished = "now" has reached the end time. An all-day event ends at 00:00 the next
    // day, so it does not become past during that day
    const past = nowStamp !== null && end <= nowStamp
    const payload: OwnEventPayload = { kind: 'own', eventId: e.id, past }
    return {
      id: e.id,
      title: e.title,
      start,
      end,
      color: past ? PAST_EVENT_COLOR : KIND_COLOR[e.kind],
      payload,
    }
  })
}

/**
 * Converts vendor news (items already detected as events) into ScheduleEventData for the
 * information layer of @mantine/schedule (pure function). As in design.md §4 "カレンダー"
 * (Calendar), they are always drawn in gray, separately from our own events (even when
 * "行く" makes one our own event, it is not removed from this information layer = both
 * keep being shown). Rows without event_start/event_end (not detected as an event) are
 * assumed to be already removed by the caller, but just in case, rows without eventStart
 * are dropped here too.
 *
 * They are treated as all-day events (00:00:00 through 00:00:00 the next day, the same as
 * the all-day case of `toScheduleEvents`). Without event_end it is considered a single day
 * (the same day as event_start). The id is prefixed with `news-` so that it does not
 * collide with the ids of our own events (because both arrays are mixed and passed to the
 * same Schedule).
 *
 * When `todayKey` ('YYYY-MM-DD') is passed, `past: true` is set on news whose dates are
 * over (the color is gray to begin with, so it does not change. The renderer dims the text
 * color).
 */
export function newsToScheduleEvents(
  items: readonly NewsEventRow[],
  todayKey?: string,
): ScheduleEventData<NewsEventPayload>[] {
  return items
    .filter((n): n is NewsEventRow & { eventStart: string } => n.eventStart !== null)
    .map((n) => {
      const start = n.eventStart
      const end = n.eventEnd ?? start
      const payload: NewsEventPayload = {
        kind: 'news',
        newsId: n.id,
        past: todayKey !== undefined && isPastNews(n, todayKey),
      }
      return {
        id: `news-${n.id}`,
        title: `${n.vendorName} ${n.title}`,
        start: `${start} 00:00:00`,
        end: `${nextDay(end)} 00:00:00`,
        color: 'gray',
        payload,
      }
    })
}

/**
 * Groups vendor news by publication date (publishedOn) and returns it with **newer dates
 * first** (pure function. For the list in `NewsAgenda`. Owner's request, 2026-09-24). The
 * date is the publication date, not the event date (eventStart) ("お知らせ" (News) is a
 * list that first of all shows that something was published, and event detection is only
 * added as a badge). Within the same day the input order is kept.
 *
 * When `todayKey` ('YYYY-MM-DD') is passed, `past: true` is set on news whose dates are
 * over (NewsAgenda dims the text color. The publication date itself is always in the past,
 * so it is not used as the criterion).
 */
export function groupNewsByDate<T extends NewsEventRow>(
  items: readonly T[],
  todayKey?: string,
): { date: string; items: { news: T; past: boolean }[] }[] {
  const groups = new Map<string, { news: T; past: boolean }[]>()
  for (const news of items) {
    const past = todayKey !== undefined && isPastNews(news, todayKey)
    const list = groups.get(news.publishedOn)
    if (list) list.push({ news, past })
    else groups.set(news.publishedOn, [{ news, past }])
  }
  return [...groups]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => ({ date, items: list }))
}
