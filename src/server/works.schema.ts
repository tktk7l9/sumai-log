import { z } from 'zod'

import { parseYouTubeId } from '../lib/youtube'
import { idField } from './zod'

// Split from works.ts for the same reason as videos.schema.ts: works.ts pulls in
// currentActorEmail, which a plain workers test cannot resolve.

export const workWatchedInput = z.object({ id: idField, watched: z.boolean() })

/** A pasted YouTube URL (watch / youtu.be / embed / shorts) -> the video id. null or '' removes the video */
export const workVideoInput = z
  .object({ id: idField, url: z.string().trim().max(500).nullable() })
  .transform((v, ctx) => {
    if (!v.url) return { id: v.id, videoId: null }
    const videoId = parseYouTubeId(v.url)
    if (!videoId) {
      ctx.addIssue({ code: 'custom', message: 'YouTube の URL を入れてください', path: ['url'] })
      return z.NEVER
    }
    return { id: v.id, videoId }
  })
export type WorkVideoInput = z.input<typeof workVideoInput>
