import { z } from 'zod'

/**
 * Filters and the view of the works page (/works). Every key falls back to "not set" on an
 * unknown value, like sourcesSearchSchema: an old or hand-typed URL shows the full list
 * instead of the error screen.
 */
export const worksSearchSchema = z.object({
  /** vendors.id */
  v: z.string().max(60).optional().catch(undefined),
  /** Only works with a tour video */
  video: z.literal(true).optional().catch(undefined),
  /** Only works not watched yet */
  unwatched: z.literal(true).optional().catch(undefined),
  /** 'spec' = the aligned view. Absent = the plain list */
  view: z.literal('spec').optional().catch(undefined),
})

export type WorksSearch = z.infer<typeof worksSearchSchema>
