/**
 * Initial values of the event form opened by "行く" (Go) on a vendor news item (owner's
 * request, 2026-09-20: do not create at once; confirm in the form, then save). The title is
 * "vendor name headline", the date is the detected start date, and the note is the URL of the
 * original article (empty for news from mail, which has no URL).
 */

import { isMailNews } from '../mail/toNews'
import { truncate } from './text'

/** Title limit of an event (same as eventInput in events.schema.ts) */
export const PLAN_TITLE_MAX = 200

export type PlanEventDefaults = {
  title: string
  date: string
  vendorId: string | null
  note: string | null
}

export function planEventDefaults(news: {
  title: string
  vendorName: string
  vendorId: string | null
  eventStart: string | null
  url: string
}): PlanEventDefaults | null {
  if (!news.eventStart) return null
  return {
    title: truncate(`${news.vendorName} ${news.title}`.trim(), PLAN_TITLE_MAX),
    date: news.eventStart,
    vendorId: news.vendorId,
    note: isMailNews(news.url) ? null : news.url,
  }
}
