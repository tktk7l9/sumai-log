import { and, asc, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import {
  type NewVendorNews,
  type Vendor,
  type VendorNews,
  vendorNews,
  vendors,
} from '../../db/schema'
import { extractEvent } from '../../lib/news/eventDate'

/**
 * One item passed to insertNewsIfNew. id, first_seen_at, created_at and updated_at are
 * generated here, so the caller does not care about them. planned_event_id is updated by
 * linkPlannedEvent only on "行く" (Go), so it is not part of the input for importing new items.
 */
export type NewNews = Omit<
  NewVendorNews,
  'id' | 'firstSeenAt' | 'createdAt' | 'updatedAt' | 'plannedEventId'
>

/**
 * The number of rows in 1 INSERT. Each row uses 9 bind parameters
 * (id, vendorId, url, title, summary, publishedOn, eventStart, eventEnd, eventKind),
 * so given D1's limit of bind parameters per query (100), rows are split into groups
 * of 10 to fit in 9 × 10 = 90. An RSS feed can exceed a dozen or so items in 1 fetch,
 * so an unsplit INSERT in 1 statement can fail as a whole on this parameter limit alone,
 * even when no item is broken.
 */
const INSERT_CHUNK_SIZE = 10

/**
 * INSERTs only new items. Does nothing if the url already exists (updates to the title
 * etc. are not tracked, per the policy in design.md §2). The return value is the number
 * actually added (the total over all chunks). `onConflictDoNothing` works on the same key
 * (url) across chunks too, so splitting does not change idempotency (0 items the 2nd time).
 */
export async function insertNewsIfNew(db: Db, rows: NewNews[]): Promise<number> {
  if (rows.length === 0) return 0
  let added = 0
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE)
    const inserted = await db
      .insert(vendorNews)
      .values(chunk.map((r) => ({ ...r, id: crypto.randomUUID() })))
      .onConflictDoNothing({ target: vendorNews.url })
      .returning({ id: vendorNews.id })
    added += inserted.length
  }
  return added
}

/**
 * `from`/`to` (both compared with published_on, bounds inclusive) are for the monthly
 * agenda of /news (fix round 1). If both are omitted, the period is not narrowed, as
 * before (the latest N items on the home, etc.).
 */
export async function listNews(
  db: Db,
  opts: { vendorId?: string; from?: string; to?: string; limit: number; offset: number },
): Promise<(VendorNews & { vendorName: string })[]> {
  const conditions = [
    opts.vendorId ? eq(vendorNews.vendorId, opts.vendorId) : undefined,
    opts.from ? gte(vendorNews.publishedOn, opts.from) : undefined,
    opts.to ? lte(vendorNews.publishedOn, opts.to) : undefined,
  ].filter((c) => c !== undefined)
  const rows = await db
    .select({ news: vendorNews, vendorName: vendors.name })
    .from(vendorNews)
    .innerJoin(vendors, eq(vendorNews.vendorId, vendors.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(vendorNews.publishedOn), desc(vendorNews.firstSeenAt))
    .limit(opts.limit)
    .offset(opts.offset)
  return rows.map((r) => ({ ...r.news, vendorName: r.vendorName }))
}

/**
 * For the information layer of the calendar. Returns vendor news judged to be events that
 * overlap the period [from, to] (rows whose event_start/event_end are null drop out
 * automatically because the comparison becomes NULL).
 */
export async function listNewsEventsBetween(
  db: Db,
  from: string,
  to: string,
): Promise<(VendorNews & { vendorName: string })[]> {
  const rows = await db
    .select({ news: vendorNews, vendorName: vendors.name })
    .from(vendorNews)
    .innerJoin(vendors, eq(vendorNews.vendorId, vendors.id))
    .where(and(lte(vendorNews.eventStart, to), gte(vendorNews.eventEnd, from)))
    .orderBy(asc(vendorNews.eventStart))
  return rows.map((r) => ({ ...r.news, vendorName: r.vendorName }))
}

/** The "vendor news with vendor name" type shared by the calendar info layer, /news and the home block */
export type NewsEventRow = Awaited<ReturnType<typeof listNewsEventsBetween>>[number]

/** Only vendors with newsUrl set (= fetch targets). For the settings page list and cron target lookup */
export async function listNewsSources(
  db: Db,
): Promise<
  Pick<Vendor, 'id' | 'name' | 'newsUrl' | 'newsSource' | 'newsFetchedAt' | 'newsFetchError'>[]
> {
  return db
    .select({
      id: vendors.id,
      name: vendors.name,
      newsUrl: vendors.newsUrl,
      newsSource: vendors.newsSource,
      newsFetchedAt: vendors.newsFetchedAt,
      newsFetchError: vendors.newsFetchError,
    })
    .from(vendors)
    .where(isNotNull(vendors.newsUrl))
    .orderBy(vendors.name)
}

/**
 * Records the fetch result. On success pass null as error (the previous error is cleared).
 * vendors.updated_at is not touched — to avoid the vendor surfacing in the
 * "最近の更新" (Recent updates) feed (recentVendors is ordered by vendors.updatedAt) on
 * every morning's automatic fetch.
 */
export async function markNewsFetched(
  db: Db,
  vendorId: string,
  error: string | null,
): Promise<void> {
  await db
    .update(vendors)
    .set({ newsFetchedAt: sql`(datetime('now'))`, newsFetchError: error })
    .where(eq(vendors.id, vendorId))
}

/**
 * "日程を再解析" (Re-parse dates) on the settings page. After the extraction logic in
 * `eventDate.ts` is fixed, re-applies it to all existing vendor_news and updates only the
 * differences (the design trade-off: the policy of judging only once at fetch time stays,
 * and an escape hatch is provided to recompute manually only when the logic improves).
 * `planned_event_id` (your own event linked by "行く") is not touched.
 * `vendors.updated_at` is not touched here at all either (the vendors table itself is not
 * updated, so it automatically does not move).
 */
export async function reparseNewsEventDates(db: Db): Promise<{ checked: number; updated: number }> {
  const rows = await db
    .select({
      id: vendorNews.id,
      title: vendorNews.title,
      summary: vendorNews.summary,
      publishedOn: vendorNews.publishedOn,
      eventStart: vendorNews.eventStart,
      eventEnd: vendorNews.eventEnd,
      eventKind: vendorNews.eventKind,
    })
    .from(vendorNews)

  let updated = 0
  for (const row of rows) {
    const event = extractEvent(`${row.title} ${row.summary ?? ''}`, row.publishedOn)
    const nextStart = event?.start ?? null
    const nextEnd = event?.end ?? null
    const nextKind = event?.kind ?? null
    if (nextStart === row.eventStart && nextEnd === row.eventEnd && nextKind === row.eventKind) {
      continue
    }
    await db
      .update(vendorNews)
      .set({ eventStart: nextStart, eventEnd: nextEnd, eventKind: nextKind })
      .where(eq(vendorNews.id, row.id))
    updated++
  }

  return { checked: rows.length, updated }
}

/** Links to your own event (events) created by "行く" */
/** 1 item (with vendor name). null if none. Used by "行く" (?plan=) on the calendar */
export async function getNewsById(
  db: Db,
  id: string,
): Promise<(VendorNews & { vendorName: string }) | null> {
  const [row] = await db
    .select({ news: vendorNews, vendorName: vendors.name })
    .from(vendorNews)
    .innerJoin(vendors, eq(vendorNews.vendorId, vendors.id))
    .where(eq(vendorNews.id, id))
    .limit(1)
  return row ? { ...row.news, vendorName: row.vendorName } : null
}

export async function linkPlannedEvent(db: Db, newsId: string, eventId: string): Promise<void> {
  await db
    .update(vendorNews)
    .set({ plannedEventId: eventId, updatedAt: sql`(datetime('now'))` })
    .where(eq(vendorNews.id, newsId))
}
