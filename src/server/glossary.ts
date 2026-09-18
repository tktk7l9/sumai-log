import { createServerFn } from '@tanstack/react-start'

import { GLOSSARY } from '../content/glossary'
import { dateKey } from '../lib/calendar'
import { termOfDay } from '../lib/glossary'
import { nowJstIso } from './events'

export type TermOfDay = { id: string; term: string; reading: string | null; summary: string }

/**
 * ホームの「今日の用語」。日付（JST）で決定的に 1 語選ぶ。用語集全体をホームのバンドルに
 * 含めないよう、表示に要る 4 項目だけ返す。
 */
export const getTermOfDay = createServerFn().handler(async (): Promise<TermOfDay | null> => {
  const t = termOfDay(GLOSSARY, dateKey(nowJstIso()))
  return t ? { id: t.id, term: t.term, reading: t.reading ?? null, summary: t.summary } : null
})
