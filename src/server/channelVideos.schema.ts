import { z } from 'zod'

import { CHANNEL_VIDEO_KINDS } from '../db/schema'
import { idField } from './zod'

// Split from channelVideos.ts for the same reason as works.schema.ts: channelVideos.ts pulls in
// currentActorEmail, which a plain workers test cannot resolve.

/** How many more rows one "show more" adds, and the most one request returns */
export const CHANNEL_VIDEO_PAGE = 30
const MAX_LIMIT = 3000

export const channelVideoListInput = z.object({
  channelId: z.string().max(40).optional(),
  kind: z.enum(CHANNEL_VIDEO_KINDS).optional(),
  unwatched: z.boolean().optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT),
})

export const channelVideoWatchedInput = z.object({ id: idField, watched: z.boolean() })

/** The 11-character YouTube id (what /records?video= carries) */
export const youtubeIdInput = z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/) })
