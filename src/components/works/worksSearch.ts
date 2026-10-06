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
  /** Videos tab: kind of video. Absent = 「動画」 (the default, see videoKindOf); 'all' = every kind */
  kind: z
    .enum([...CHANNEL_VIDEO_KINDS, 'all'])
    .optional()
    .catch(undefined),
  /** Videos tab: part of the title */
  q: z.string().max(100).optional().catch(undefined),
  /** Videos tab: how many rows are shown (grows with "show more") */
  n: z.number().int().min(1).max(3000).optional().catch(undefined),
})

export type WorksSearch = z.infer<typeof worksSearchSchema>

/**
 * The kind the videos tab shows for a `kind` search value. Shorts and live streams were never
 * watched (0 of 652 shorts, 2 of 308 streams, 2026-10-06), so the list opens on the videos
 * alone; 「全種類」 (every kind) is an explicit choice (SHIG 42)
 */
export function videoKindOf(kind: WorksSearch['kind']): ChannelVideoKind | undefined {
  if (kind === 'all') return undefined
  return kind ?? 'video'
}

export type ChannelVideoKind = (typeof CHANNEL_VIDEO_KINDS)[number]
