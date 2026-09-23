import { createServerFn } from '@tanstack/react-start'

import { GLOSSARY } from '../content/glossary'
import { getDb } from '../db/client'
import { comments, vendors } from '../db/schema'
import { analyzeRecords } from '../lib/analysis'
import { nowJstIso } from './events'
import { listAllEvents, listVideosWithLinks, listVisitsWithLinks } from './repository'

/**
 * 記録の分析（/analysis）。D1 から見学・動画・業者・予定・コメントを読み、集計は
 * src/lib/analysis.ts の純粋関数で行う。画面には集計結果だけを返す（本文を丸ごと送らない）
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
