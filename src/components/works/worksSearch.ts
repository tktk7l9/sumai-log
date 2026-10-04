import { z } from 'zod'

import { CHANNEL_VIDEO_KINDS } from '../../db/schema'

/**
 * Filters and the view of the works page (/works). Every key falls back to "not set" on an
 * unknown value, like sourcesSearchSchema: an old or hand-typed URL shows the full list
 * instead of the error screen.
 */
export const worksSearchSchema = z.object({
  /** 'works' = the built examples. Absent = every video of the channels (the default: most works
   * are also a tour video, and the video links to its work) */
  tab: z.literal('works').optional().catch(undefined),
  /** vendors.id */
  v: z.string().max(60).optional().catch(undefined),
  /** Only works with a tour video */
  video: z.literal(true).optional().catch(undefined),
  /** Only works (or videos) not watched yet */
  unwatched: z.literal(true).optional().catch(undefined),
  /** 'spec' = the aligned view. Absent = the plain list */
  view: z.literal('spec').optional().catch(undefined),
  /** Videos tab: YouTube channel id */
  ch: z.string().max(40).optional().catch(undefined),
  /** Videos tab: kind of video */
  kind: z.enum(CHANNEL_VIDEO_KINDS).optional().catch(undefined),
  /** Videos tab: part of the title */
  q: z.string().max(100).optional().catch(undefined),
  /** Videos tab: how many rows are shown (grows with "show more") */
  n: z.number().int().min(1).max(3000).optional().catch(undefined),
})

export type WorksSearch = z.infer<typeof worksSearchSchema>
