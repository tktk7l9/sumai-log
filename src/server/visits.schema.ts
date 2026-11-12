import { z } from 'zod'

import { ATTENDEES } from '../db/enums'
import { dateField, idField } from './zod'

/**
 * Why this is split from visits.ts: same as events.schema.ts (see the comment there for
 * details). visits.ts uses currentActorEmail (which statically imports getRequest from
 * `@tanstack/react-start/server`) inside saveVisit, and loading visits.ts via import from a
 * plain vitest workers test fails to resolve the virtual specifier that the TanStack Start
 * Vite plugin provides. reorderPhotosInput itself is a pure zod schema that needs neither
 * D1 nor members, so it is extracted here and visits.worker-test.ts imports from here
 * (visits.ts only re-exports it, so the public import path and behavior do not change).
 * visitInput is here for the same reason.
 *
 * zod does not go as far as checking "does the photo belong to that visit record"
 * (because that needs D1). Here we look only at the shape (not empty, id shape, no
 * duplicates) and leave the ownership check to reorderPhotoRows in the repository.
 */
export const reorderPhotosInput = z.object({
  visitId: idField,
  photoIds: z
    .array(idField)
    .min(1, '写真が指定されていません')
    .refine((arr) => new Set(arr).size === arr.length, '同じ写真が重複して指定されています'),
})
export type ReorderPhotosInput = z.infer<typeof reorderPhotosInput>

/**
 * The limit of the four free-text fields of a visit record, the same as a video's takeaways.
 * They used optionalText (2,000): a long visit could not be saved and the form only said
 * 「保存できませんでした」 (2026-11). VisitForm puts this number on the textareas as maxLength.
 */
export const VISIT_TEXT_MAX = 4000

/** The same null / empty-string semantics as optionalText; only the limit differs */
export const visitText = z
  .string()
  .trim()
  .max(VISIT_TEXT_MAX)
  .transform((v) => (v === '' ? null : v))
  .nullable()

export const visitInput = z.object({
  id: idField.optional(),
  // Update time as of opening. If the other person saved first, return a conflict instead
  // of overwriting (repository/stale.ts)
  expectedUpdatedAt: z.string().max(40).nullish(),
  eventId: idField.nullable(),
  placeId: idField.nullable(),
  vendorId: idField.nullable(),
  propertyId: idField.nullable(),
  visitedOn: dateField,
  // The attendees input field was removed (records are basically written by the two
  // together, 2026-09-19). The column stays and always holds the default value
  attendees: z.enum(ATTENDEES).default('both'),
  good: visitText,
  concerns: visitText,
  qa: visitText,
  nextActions: visitText,
})
export type VisitInput = z.input<typeof visitInput>
