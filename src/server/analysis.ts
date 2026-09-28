import { createServerFn } from '@tanstack/react-start'

import { GLOSSARY } from '../content/glossary'
import { getDb } from '../db/client'
import { comments, vendors } from '../db/schema'
import { analyzeRecords } from '../lib/analysis'
import { nowJstIso } from './events'
import { listAllEvents, listVideosWithLinks, listVisitsWithLinks } from './repository'

/**
 * Analysis of the records (/analysis). Reads visits, videos, vendors, events and comments from
 * D1, and aggregates with the pure functions in src/lib/analysis.ts. Only the aggregated
 * result is returned to the screen (the full bodies are not sent)
 */
export const getAnalysis = createServerFn().handler(async () => {
  const db = getDb()
  const [visits, videos, vendorRows, events, commentRows] = await Promise.all([
    listVisitsWithLinks(db),
    listVideosWithLinks(db),
    db.select({ id: vendors.id, name: vendors.name, status: vendors.status }).from(vendors),
    listAllEvents(db),
    db
      .select({ targetType: comments.targetType, targetId: comments.targetId, body: comments.body })
      .from(comments),
  ])
  const today = nowJstIso().slice(0, 10)
  return {
    today,
    analysis: analyzeRecords({
      visits,
      videos,
      vendors: vendorRows,
      events,
      comments: commentRows,
      terms: GLOSSARY,
      today,
    }),
  }
})
