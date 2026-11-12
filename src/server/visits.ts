import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDb } from '../db/client'
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
  saveOrConflict,
  StaleWriteError,
  setVisitNextActions,
} from './repository'
import { deletePhotoObjects } from './storage'
import { reorderPhotosInput, visitInput, visitText } from './visits.schema'
import { idField, idInput } from './zod'
import { listLinkTargets } from './places'

// reorderPhotosInput and visitInput come from visits.schema.ts (see there for why they were
// split for the tests). The public import path (available from './visits') does not change.
export { reorderPhotosInput, visitInput }
export type { ReorderPhotosInput, VisitInput } from './visits.schema'

export const listVisits = createServerFn().handler(async () => listVisitsWithLinks(getDb()))

export const getVisit = createServerFn()
  .validator(idInput)
  .handler(async ({ data }) => {
    const detail = await getVisitDetail(getDb(), data.id)
    if (!detail) throw notFound()
    return detail
  })

export const saveVisit = createServerFn({ method: 'POST' })
  .validator(visitInput)
  .handler(async ({ data }) =>
    saveOrConflict(async () => upsertVisit(getDb(), data, await currentActorEmail())),
  )

/** Saves the "次にやること" (next actions) checklist. On conflict, { conflict: true } */
export const saveVisitNextActions = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: idField,
      // The same limit as the form, or a long list could be saved there and not ticked here
      nextActions: visitText,
      expectedUpdatedAt: z.string().min(1).max(40),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const updatedAt = await setVisitNextActions(
        getDb(),
        data.id,
        data.nextActions,
        data.expectedUpdatedAt,
      )
      return { conflict: false as const, updatedAt }
    } catch (e) {
      if (e instanceof StaleWriteError) return { conflict: true as const, updatedAt: null }
      throw e
    }
  })

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

/** Reorders photos. Reassigns sortOrder as 0,1,... in the order given in photoIds.
 * If an id that does not belong to that visit record is mixed in, does nothing and
 * returns ok: false (same pattern as deleteComment of CommentThread) */
export const reorderPhotos = createServerFn({ method: 'POST' })
  .validator(reorderPhotosInput)
  .handler(async ({ data }) => ({
    ok: await reorderPhotoRows(getDb(), data.visitId, data.photoIds),
  }))

/** Options for the visit record form. Events cover the last 180 days */
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
