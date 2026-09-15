import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '../db/client'
import { events } from '../db/schema'
import { dateKey, monthKeys } from '../lib/calendar'
import { pendingVisitEvents, upcomingEvents } from '../lib/pending'
import { eventInput } from './events.schema'
import { currentActorEmail } from './members'
import {
  deleteEvent as deleteEventRow,
  listEventsWithLinks,
  listRecordedEventIds,
  upsertEvent,
} from './repository'
import { idInput } from './zod'

// eventInput は events.schema.ts から（テストの都合で分離した理由はそちら参照）。
// 公開する import パス（'./events' から eventInput/EventInput を取れる）は変えない。
export { eventInput }
export type { EventInput } from './events.schema'

/** 「今」。JST の ISO 文字列（Worker は UTC なので +9h して整形） */
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

export const getEvent = createServerFn()
  .validator(idInput)
  .handler(async ({ data }) => {
    const [event] = await getDb().select().from(events).where(eq(events.id, data.id)).limit(1)
    if (!event) throw new Response('Not Found', { status: 404 })
    return { event }
  })

export const saveEvent = createServerFn({ method: 'POST' })
  .validator(eventInput)
  .handler(async ({ data }) => ({
    id: await upsertEvent(getDb(), data, await currentActorEmail()),
  }))

export const deleteEvent = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    await deleteEventRow(getDb(), data.id)
    return { ok: true as const }
  })

/** ホーム用: 次の予定 3 件と「記録を書きませんか」 */
export const listHomeEvents = createServerFn().handler(async () => {
  const db = getDb()
  const now = nowJstIso()
  const today = dateKey(now)
  // 過去 90 日〜未来 365 日を見れば十分
  const from = dateKey(new Date(Date.parse(today) - 90 * 86400000).toISOString())
  const to = dateKey(new Date(Date.parse(today) + 365 * 86400000).toISOString())
  const [rows, recorded] = await Promise.all([
    listEventsWithLinks(db, from, to),
    listRecordedEventIds(db),
  ])
  return {
    upcoming: upcomingEvents(rows, now, 3),
    pending: pendingVisitEvents(rows, recorded, now).slice(0, 5),
    nowIso: now,
  }
})
