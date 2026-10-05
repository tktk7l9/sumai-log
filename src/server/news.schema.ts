import { z } from 'zod'

import { dateField, idField } from './zod'

/**
 * Why this is split from news.ts: the same as events.schema.ts / videos.schema.ts
 * (see the comments there for details). news.ts wraps its handlers in createServerFn, and
 * loading news.ts through import from a plain vitest workers test fails to resolve the
 * virtual specifier provided by the TanStack Start Vite plugin and crashes. The schemas
 * placed here are pure zod schemas that need neither D1 nor members, so
 * news.worker-test.ts imports from this file (news.ts only re-exports, and the public
 * import path and behaviour do not change).
 */

export const listVendorNewsInput = z.object({
  vendorId: idField.optional(),
  // Filter by a period of the publication date (published_on). The monthly agenda of /news
  // (fix round 1) passes the first/last day of that month. Omitting both means no period
  // filter (the latest N items on the home page remain a call that does not care about the
  // period). Unlike newsEventsBetweenInput both are optional (only one, or neither, are all
  // possible depending on the caller).
  from: dateField.optional(),
  to: dateField.optional(),
  // Safety cap for 1 month. "もっと見る" (Load more) paging (formerly: the trick of querying
  // the display limit +1 items to decide hasMore) was removed from /news in fix round 1, so
  // the cap is now plainly 200 (the former 201 existed only for that trick).
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
})
export type ListVendorNewsInput = z.input<typeof listVendorNewsInput>

/**
 * For the information layer of the calendar (a display range that spans months). The month
 * view of the calendar screen takes a wider range for the weeks that spill over before and
 * after (visibleRange in src/routes/calendar.tsx), so instead of cutting by month the actual
 * display range itself is passed here.
 */
export const newsEventsBetweenInput = z.object({ from: dateField, to: dateField })
export type NewsEventsBetweenInput = z.input<typeof newsEventsBetweenInput>

/** Looks up just 1 item when "行く" (Go) opens the event form (/calendar?plan=<newsId>) */
export const newsIdInput = z.object({ id: idField })
/** Links the event saved in the form to the vendor news item (plannedEventId) */
export const linkNewsEventInput = z.object({ newsId: idField, eventId: idField })
