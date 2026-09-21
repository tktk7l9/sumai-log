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
} from './repository'
import { dateField, idInput } from './zod'

// eventInput は events.schema.ts から（テストの都合で分離した理由はそちら参照）。
// 公開する import パス（'./events' から eventInput/EventInput を取れる）は変えない。
export { eventInput }
export type { EventInput } from './events.schema'

/**
 * 日付キーの事実上の最大値。予定の日付は TEXT の 'YYYY-MM-DD' なので、
 * between の上限にこれを渡せば「上限なし」と同じ意味になる。
 */
const MAX_DATE_KEY = '9999-12-31'

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

/**
 * 予定タブ（Mantine Schedule）用。日/週/月ビューが跨ぐ可能性のある任意の期間で取る。
 * listMonthEvents と違い年月ではなく日付の範囲そのものを受け取る。
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
  .handler(async ({ data }) => ({
    id: await upsertEvent(getDb(), data, await currentActorEmail()),
  }))

export const deleteEvent = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    await deleteEventRow(getDb(), data.id)
    return { ok: true as const }
  })

/**
 * ホーム用: 「記録を書きませんか」と、これからの予定（アジェンダ）。
 * アジェンダは今日以降の予定を**期間で切らずに全部**返す（所有者の要望、2026-09-21。
 * それまでは今日〜+27 日の 4 週間ぶんだけだった）。「次の予定」はアジェンダと重複する
 * ため 2026-09-19 に廃止。
 *
 * 未来側に上限を置かないので、クエリの範囲も上限なし（MAX_DATE_KEY）で引く。
 * 日付キーは 'YYYY-MM-DD' の文字列比較なので、事実上の最大値を上限に渡せば無制限に
 * なる。二人ぶんの予定なので件数は高々数十件で、絞り込みは取得済みの rows を
 * フィルタするだけで済ませる（同じ range を二度 DB に問い合わせない）。
 */
export const listHomeEvents = createServerFn().handler(async () => {
  const db = getDb()
  const now = nowJstIso()
  const today = dateKey(now)
  // 「記録を書きませんか」は過去 90 日ぶんを見れば十分。未来側は上限なし
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
    // AgendaView は rangeStart〜rangeEnd の外に出たイベントを描かないので、
    // 終わりは「最後の予定の日」に合わせる（終了日が開始日より後の予定も欠けないよう
    // endsAt も見る）。1 件も無ければ今日だけの空レンジ
    agendaTo: agendaEnd(agenda, agendaFrom),
    nowIso: now,
  }
})

/** アジェンダの rangeEnd。予定が無ければ from（= 今日）そのもの */
function agendaEnd(agenda: readonly { startsAt: string; endsAt: string | null }[], from: string) {
  let end = from
  for (const e of agenda) {
    const last = dateKey(e.endsAt ?? e.startsAt)
    if (last > end) end = last
  }
  return end
}
