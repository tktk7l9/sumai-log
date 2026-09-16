import { and, asc, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import {
  type NewVendorNews,
  type Vendor,
  type VendorNews,
  vendorNews,
  vendors,
} from '../../db/schema'

/**
 * insertNewsIfNew に渡す1件分。id・first_seen_at・created_at・updated_at はここで
 * 生成するので呼び出し側は意識しない。planned_event_id は「行く」のときだけ
 * linkPlannedEvent で更新するので、新着取り込みの入力には含めない。
 */
export type NewNews = Omit<
  NewVendorNews,
  'id' | 'firstSeenAt' | 'createdAt' | 'updatedAt' | 'plannedEventId'
>

/**
 * 新着だけ INSERT する。url が既にあれば何もしない（タイトル等の更新は追わない。
 * design.md §2 の方針どおり）。戻り値は実際に追加できた件数。
 */
export async function insertNewsIfNew(db: Db, rows: NewNews[]): Promise<number> {
  if (rows.length === 0) return 0
  const inserted = await db
    .insert(vendorNews)
    .values(rows.map((r) => ({ ...r, id: crypto.randomUUID() })))
    .onConflictDoNothing({ target: vendorNews.url })
    .returning({ id: vendorNews.id })
  return inserted.length
}

export async function listNews(
  db: Db,
  opts: { vendorId?: string; limit: number; offset: number },
): Promise<(VendorNews & { vendorName: string })[]> {
  const rows = await db
    .select({ news: vendorNews, vendorName: vendors.name })
    .from(vendorNews)
    .innerJoin(vendors, eq(vendorNews.vendorId, vendors.id))
    .where(opts.vendorId ? eq(vendorNews.vendorId, opts.vendorId) : undefined)
    .orderBy(desc(vendorNews.publishedOn), desc(vendorNews.firstSeenAt))
    .limit(opts.limit)
    .offset(opts.offset)
  return rows.map((r) => ({ ...r.news, vendorName: r.vendorName }))
}

/**
 * カレンダーの情報レイヤー用。期間 [from, to] と重なる、イベント判定済みのお知らせを返す
 * （event_start/event_end が null の行は比較が NULL になるため自動的に外れる）。
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

/** newsUrl が設定されている業者（= 取得対象）だけを返す。設定ページの一覧・cron の対象探索用 */
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
 * 取得結果を記録する。成功時は error に null を渡す（前回のエラーが消える）。
 * vendors.updated_at は動かさない — 毎朝の自動取得のたびに「最近の更新」フィード
 * （recentVendors は vendors.updatedAt 順）に業者が浮上してしまうのを避けるため。
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

/** 「行く」で作った自分の予定（events）に紐づける */
export async function linkPlannedEvent(db: Db, newsId: string, eventId: string): Promise<void> {
  await db
    .update(vendorNews)
    .set({ plannedEventId: eventId, updatedAt: sql`(datetime('now'))` })
    .where(eq(vendorNews.id, newsId))
}
