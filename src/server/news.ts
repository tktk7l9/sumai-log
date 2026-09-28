import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { events, vendorNews, vendors } from '../db/schema'
import { isMailNews } from '../lib/mail/toNews'
import { truncate } from '../lib/news/text'
import { currentActorEmail } from './members'
import { fetchAllVendorNews } from './newsFetcher'
import {
  linkNewsEventInput,
  listVendorNewsInput,
  newsEventsBetweenInput,
  newsIdInput,
  planVisitInput,
} from './news.schema'
import {
  getNewsById,
  linkPlannedEvent,
  listNews,
  listNewsEventsBetween,
  listNewsSources,
  reparseNewsEventDates,
  upsertEvent,
} from './repository'

// The validators come from news.schema.ts (see there for why they were split for the sake of
// tests). The public import path (available from './news') does not change.
export {
  linkNewsEventInput,
  listVendorNewsInput,
  newsEventsBetweenInput,
  newsIdInput,
  planVisitInput,
}

// The same limit as eventInput in events.schema.ts (an event title is at most 200 characters).
const EVENT_TITLE_MAX = 200

/**
 * For the `/news` page (per month. Filtered by from/to) and the "お知らせ" (vendor news) block
 * on the home page. Newest first
 */
export const listVendorNews = createServerFn()
  .validator(listVendorNewsInput)
  .handler(async ({ data }) => {
    const news = await listNews(getDb(), data)
    return { news }
  })

/**
 * For the information layer of the calendar (any period). The month view takes a wider range
 * for the weeks that spill over before and after (visibleRange in calendar.tsx), so cutting
 * by month would miss the information of the weeks that cross the range. The from/to actually
 * displayed are passed as is.
 */
export const newsEventsBetween = createServerFn()
  .validator(newsEventsBetweenInput)
  .handler(async ({ data }) => {
    const news = await listNewsEventsBetween(getDb(), data.from, data.to)
    return { news }
  })

/** The card list of "業者のお知らせ" (Vendor news) on the settings page */
export const newsSources = createServerFn().handler(async () => {
  const sources = await listNewsSources(getDb())
  return { sources }
})

/** "今すぐ取得" (Fetch now) on the settings page. Fetches every vendor that has newsUrl set */
export const fetchNewsNow = createServerFn({ method: 'POST' }).handler(async () => {
  const results = await fetchAllVendorNews(getDb())
  return { results }
})

/**
 * "日程を再解析" (Re-parse dates) on the settings page. After misses of `extractEvent`
 * (`src/lib/news/eventDate.ts`) are fixed, recompute against all existing vendor_news rows
 * and update only the rows that changed (returns `{ checked, updated }`. The button wording
 * uses these 2 numbers).
 */
export const reparseNewsEvents = createServerFn({ method: 'POST' }).handler(async () => {
  return await reparseNewsEventDates(getDb())
})

/**
 * "行く" (Go) on a vendor news item. As design.md §2 says, creates an event with kind='visit'
 * in events and links it to vendor_news.planned_event_id. When already linked, nothing new
 * is created and that eventId is returned as is (however many presses, it points to the same
 * event).
 */
export const planVisitFromNews = createServerFn({ method: 'POST' })
  .validator(planVisitInput)
  .handler(async ({ data }) => {
    const db = getDb()
    const [news] = await db.select().from(vendorNews).where(eq(vendorNews.id, data.newsId)).limit(1)
    if (!news) throw new Response('Not Found', { status: 404 })
    if (news.plannedEventId) return { eventId: news.plannedEventId }
    if (!news.eventStart) {
      throw new Response('この見出しには日程がありません。', { status: 400 })
    }

    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, news.vendorId)).limit(1)
    const title = truncate(`${vendor?.name ?? ''} ${news.title}`.trim(), EVENT_TITLE_MAX)

    const eventId = await upsertEvent(
      db,
      {
        title,
        kind: 'visit',
        startsAt: news.eventStart,
        endsAt: null,
        allDay: true,
        placeId: null,
        vendorId: news.vendorId,
        propertyId: null,
        // The url of vendor news that came from mail is `mail:<Message-ID>` (an internal
        // identifier that cannot be opened), so it is not put into the note of the event. The
        // body can be read from the settings page / the vendor news drawer.
        note: isMailNews(news.url) ? null : news.url,
      },
      await currentActorEmail(),
    )
    await linkPlannedEvent(db, news.id, eventId)
    return { eventId }
  })

/** Fetches 1 item so that "行く" can open the event form (/calendar?plan=<newsId>) */
export const getVendorNews = createServerFn()
  .validator(newsIdInput)
  .handler(async ({ data }) => ({ news: await getNewsById(getDb(), data.id) }))

/**
 * Links the event saved in the event form to the vendor news item (owner's request
 * 2026-09-20: "行く" opens the form instead of creating at once, and planned_event_id is
 * attached here after saving).
 * When already linked it stays as is (no overwrite). 404 when the event does not exist.
 */
export const linkNewsToEvent = createServerFn({ method: 'POST' })
  .validator(linkNewsEventInput)
  .handler(async ({ data }) => {
    const db = getDb()
    const [news] = await db.select().from(vendorNews).where(eq(vendorNews.id, data.newsId)).limit(1)
    if (!news) throw new Response('Not Found', { status: 404 })
    if (news.plannedEventId) return { eventId: news.plannedEventId }
    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, data.eventId))
      .limit(1)
    if (!event) throw new Response('Not Found', { status: 404 })
    await linkPlannedEvent(db, news.id, event.id)
    return { eventId: event.id }
  })
