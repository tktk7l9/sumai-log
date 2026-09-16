import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDb } from '../db/client'
import { ATTENDEES } from '../db/schema'
import { dateKey } from '../lib/calendar'
import { nowJstIso } from './events'
import { currentActorEmail } from './members'
import {
  deletePhotoRow,
  deleteVisitCascade,
  getVisitDetail,
  listEventsBetween,
  listPlacesWithLinks,
  listVisitsWithLinks,
  reorderPhotoRows,
  upsertVisit,
} from './repository'
import { deletePhotoObjects } from './storage'
import { reorderPhotosInput } from './visits.schema'
import { dateField, idField, idInput, optionalText } from './zod'
import { listLinkTargets } from './places'

// reorderPhotosInput は visits.schema.ts から（テストの都合で分離した理由はそちら参照）。
// 公開する import パス（'./visits' から reorderPhotosInput/ReorderPhotosInput を取れる）は変えない。
export { reorderPhotosInput }
export type { ReorderPhotosInput } from './visits.schema'

export const visitInput = z.object({
  id: idField.optional(),
  eventId: idField.nullable(),
  placeId: idField.nullable(),
  vendorId: idField.nullable(),
  propertyId: idField.nullable(),
  visitedOn: dateField,
  attendees: z.enum(ATTENDEES),
  good: optionalText,
  concerns: optionalText,
  qa: optionalText,
  nextActions: optionalText,
})
export type VisitInput = z.input<typeof visitInput>

export const listVisits = createServerFn().handler(async () => listVisitsWithLinks(getDb()))

export const getVisit = createServerFn()
  .validator(idInput)
  .handler(async ({ data }) => {
    const detail = await getVisitDetail(getDb(), data.id)
    if (!detail) throw new Response('Not Found', { status: 404 })
    return detail
  })

export const saveVisit = createServerFn({ method: 'POST' })
  .validator(visitInput)
  .handler(async ({ data }) => ({
    id: await upsertVisit(getDb(), data, await currentActorEmail()),
  }))

export const deleteVisit = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    const keys = await deleteVisitCascade(getDb(), data.id)
    await deletePhotoObjects(keys)
    return { ok: true as const }
  })

export const deletePhoto = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    const row = await deletePhotoRow(getDb(), data.id)
    if (row) await deletePhotoObjects([row.displayKey, row.thumbKey])
    return { ok: row !== null }
  })

/** 写真の並び替え。photoIds に指定した順で sortOrder を 0,1,… に振り直す。
 * その見学記録に属さない id が混ざっていたら何もせず ok: false（CommentThread の
 * deleteComment と同じパターン） */
export const reorderPhotos = createServerFn({ method: 'POST' })
  .validator(reorderPhotosInput)
  .handler(async ({ data }) => ({
    ok: await reorderPhotoRows(getDb(), data.visitId, data.photoIds),
  }))

/** 見学記録フォームの選択肢。予定は直近 180 日 */
export const visitFormOptions = createServerFn().handler(async () => {
  const db = getDb()
  const today = dateKey(nowJstIso())
  const from = dateKey(new Date(Date.parse(today) - 180 * 86400000).toISOString())
  const to = dateKey(new Date(Date.parse(today) + 30 * 86400000).toISOString())
  const [targets, places, events] = await Promise.all([
    listLinkTargets(),
    listPlacesWithLinks(db),
    listEventsBetween(db, from, to),
  ])
  return { targets, places, events }
})
