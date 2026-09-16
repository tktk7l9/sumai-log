import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { vendorNews, vendors } from '../db/schema'
import { truncate } from '../lib/news/text'
import { currentActorEmail } from './members'
import { fetchAllVendorNews } from './newsFetcher'
import { listVendorNewsInput, newsEventsBetweenInput, planVisitInput } from './news.schema'
import {
  linkPlannedEvent,
  listNews,
  listNewsEventsBetween,
  listNewsSources,
  reparseNewsEventDates,
  upsertEvent,
} from './repository'

// バリデータは news.schema.ts から（テストの都合で分離した理由はそちら参照）。
// 公開する import パス（'./news' から取れる）は変えない。
export { listVendorNewsInput, newsEventsBetweenInput, planVisitInput }

// events.schema.ts の eventInput と同じ上限（予定のタイトルは最大 200 字）。
const EVENT_TITLE_MAX = 200

/** `/news` ページ（月ごと。from/to で絞り込み）・ホームの「お知らせ」ブロック用。新しい順 */
export const listVendorNews = createServerFn()
  .validator(listVendorNewsInput)
  .handler(async ({ data }) => {
    const news = await listNews(getDb(), data)
    return { news }
  })

/**
 * カレンダーの情報レイヤー用（任意の期間）。月表示は前後の週がはみ出すぶん広めに
 * 範囲を取る（calendar.tsx の visibleRange）ため、月単位で区切ると範囲をまたぐ
 * 週の情報が漏れる。実際に表示している from/to をそのまま渡す。
 */
export const newsEventsBetween = createServerFn()
  .validator(newsEventsBetweenInput)
  .handler(async ({ data }) => {
    const news = await listNewsEventsBetween(getDb(), data.from, data.to)
    return { news }
  })

/** 設定ページの「業者のお知らせ」カード一覧 */
export const newsSources = createServerFn().handler(async () => {
  const sources = await listNewsSources(getDb())
  return { sources }
})

/** 設定ページの「今すぐ取得」。newsUrl が設定されている全業者を取得する */
export const fetchNewsNow = createServerFn({ method: 'POST' }).handler(async () => {
  const results = await fetchAllVendorNews(getDb())
  return { results }
})

/**
 * 設定ページの「日程を再解析」。`extractEvent`（`src/lib/news/eventDate.ts`）の
 * 取りこぼしを直した後、既存の vendor_news 全件に対して再計算し、変わった行だけ
 * 更新する（`{ checked, updated }` を返す。ボタンの文言はこの2つの数を使う）。
 */
export const reparseNewsEvents = createServerFn({ method: 'POST' }).handler(async () => {
  return await reparseNewsEventDates(getDb())
})

/**
 * お知らせの「行く」。design.md §2 のとおり events に kind='visit' の予定を作り、
 * vendor_news.planned_event_id に紐づける。既に紐づいていれば新しく作らず、
 * その eventId をそのまま返す（何度押しても同じ予定を指す）。
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
        note: news.url,
      },
      await currentActorEmail(),
    )
    await linkPlannedEvent(db, news.id, eventId)
    return { eventId }
  })
