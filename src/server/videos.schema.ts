import { z } from 'zod'

import { ATTENDEES } from '../db/schema'
import { canonicalYouTubeUrl, parseYouTubeId } from '../lib/youtube'
import { dateField, idField, optionalUrl } from './zod'

/**
 * Why this is split from videos.ts: same as events.schema.ts (see the comment there for
 * details). videos.ts uses currentActorEmail (which statically imports getRequest from
 * `@tanstack/react-start/server`) inside saveVideo, and loading videos.ts via import from a
 * plain vitest workers test fails to resolve the virtual specifier that the TanStack Start
 * Vite plugin provides. videoInput itself is a pure zod schema that needs neither D1 nor
 * members, so it is extracted here and videos.worker-test.ts imports from here (videos.ts
 * only re-exports it, so the public import path and behavior do not change).
 */
export const videoInput = z
  .object({
    id: idField.optional(),
    // Update time as of opening. If the other person saved first, return a conflict instead
    // of overwriting (repository/stale.ts)
    expectedUpdatedAt: z.string().max(40).nullish(),
    url: z.string().trim().max(500),
    title: z.string().trim().min(1, '題名は必須です').max(300),
    // optionalText cannot be used here because the helper has a fixed shape (max 2000) (G3-R2).
    // Keep the same null/empty-string semantics and change only the upper limit.
    channel: z
      .string()
      .trim()
      .max(200)
      .transform((v) => (v === '' ? null : v))
      .nullable(),
    thumbnailUrl: optionalUrl,
    watchedOn: dateField.nullable(),
    // The "watched by" input field was removed (2026-09-19). The column stays and always
    // holds the default value
    watchedBy: z.enum(ATTENDEES).default('both'),
    tags: z.array(z.string().trim().min(1).max(30)).max(10),
    takeaways: z
      .string()
      .trim()
      .max(4000)
      .transform((v) => (v === '' ? null : v))
      .nullable(),
    vendorId: idField.nullable(),
  })
  .transform((v, ctx) => {
    const videoId = parseYouTubeId(v.url)
    if (!videoId) {
      ctx.addIssue({ code: 'custom', message: 'YouTube の URL を入れてください', path: ['url'] })
      return z.NEVER
    }
    return { ...v, videoId, url: canonicalYouTubeUrl(videoId) }
  })
export type VideoInput = z.input<typeof videoInput>
