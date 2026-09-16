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
 * insertNewsIfNew に渡す1件分。id・first_seen_at・created_at・updated_at はここで
 * 生成するので呼び出し側は意識しない。planned_event_id は「行く」のときだけ
 * linkPlannedEvent で更新するので、新着取り込みの入力には含めない。
 */
export type NewNews = Omit<
  NewVendorNews,
  'id' | 'firstSeenAt' | 'createdAt' | 'updatedAt' | 'plannedEventId'
>

/**
 * 1 回の INSERT に含める行数。1 行あたり 9 個のバインドパラメータ
 * （id・vendorId・url・title・summary・publishedOn・eventStart・eventEnd・eventKind）
 * を使うため、D1 の 1 クエリあたりのバインドパラメータ上限（100）を踏まえて
 * 9 × 10 = 90 に収まるよう 10 件ずつに分ける。RSS フィードは 1 回の取得で
 * 十数件を超えることがあるため、分けずに 1 文で INSERT すると壊れた項目が無くても
 * このパラメータ上限だけで INSERT 全体が失敗しうる。
 */
const INSERT_CHUNK_SIZE = 10

/**
 * 新着だけ INSERT する。url が既にあれば何もしない（タイトル等の更新は追わない。
 * design.md §2 の方針どおり）。戻り値は実際に追加できた件数（全チャンクの合計）。
 * `onConflictDoNothing` はチャンクをまたいでも同じキー（url）で効くので、
 * 分割しても冪等性（2 回目は 0 件）は変わらない。
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
 * `from`/`to`（どちらも published_on との比較、境界含む）は /news の月ごとのアジェンダ
 * （fix round 1）向け。どちらも省略すれば従来どおり期間を絞らない（ホームの最新 N 件など）。
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

/** カレンダーの情報レイヤー・/news・ホームのブロックで共通に使う「業者名付きお知らせ」の型 */
export type NewsEventRow = Awaited<ReturnType<typeof listNewsEventsBetween>>[number]

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

/**
 * 設定ページの「日程を再解析」。`eventDate.ts` の抽出ロジックが直った後に、
 * 既存の vendor_news 全件へ再適用して差分だけ更新する（design のトレードオフ:
 * 取得時に1回だけ判定する方針は変えず、ロジック改善時だけ手動で再計算できる
 * 逃げ道を用意する）。`planned_event_id`（「行く」で紐づけた自分の予定）は
 * 触らない。`vendors.updated_at` もここでは一切触らない（vendors テーブル自体を
 * 更新しないため自動的に動かない）。
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

/** 「行く」で作った自分の予定（events）に紐づける */
export async function linkPlannedEvent(db: Db, newsId: string, eventId: string): Promise<void> {
  await db
    .update(vendorNews)
    .set({ plannedEventId: eventId, updatedAt: sql`(datetime('now'))` })
    .where(eq(vendorNews.id, newsId))
}
