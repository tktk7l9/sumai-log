import { z } from 'zod'

import { idField } from './zod'

/**
 * Why this is split from visits.ts: same as events.schema.ts (see the comment there for
 * details). visits.ts uses currentActorEmail (which statically imports getRequest from
 * `@tanstack/react-start/server`) inside saveVisit, and loading visits.ts via import from a
 * plain vitest workers test fails to resolve the virtual specifier that the TanStack Start
 * Vite plugin provides. reorderPhotosInput itself is a pure zod schema that needs neither
 * D1 nor members, so it is extracted here and visits.worker-test.ts imports from here
 * (visits.ts only re-exports it, so the public import path and behavior do not change).
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
