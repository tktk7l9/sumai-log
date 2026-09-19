/**
 * お知らせの「行く」で開く予定フォームの初期値（所有者の要望、2026-09-20: 即作成せず
 * フォームで確認してから保存する）。タイトルは「業者名 見出し」、日付は判定した開始日、
 * メモは元記事の URL（メール由来は URL が無いので空）。
 */

import { isMailNews } from '../mail/toNews'
import { truncate } from './text'

/** 予定のタイトル上限（events.schema.ts の eventInput と同じ） */
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
