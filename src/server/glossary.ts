import { createServerFn } from '@tanstack/react-start'

import { GLOSSARY } from '../content/glossary'
import { pickRandomTerm } from '../lib/glossary'

export type GlossaryPick = { id: string; term: string; reading: string | null; summary: string }

/**
 * ホームの「用語集から」。読み込むたびにランダムに 1 語（所有者の要望、2026-09-19。
 * 当初は日替わりだった）。loader はサーバーで走り結果が HTML に埋まるので hydration は揺れない。
 * 用語集全体をホームのバンドルに含めないよう、表示に要る 4 項目だけ返す。
 */
export const pickGlossaryTerm = createServerFn().handler(async (): Promise<GlossaryPick | null> => {
  const t = pickRandomTerm(GLOSSARY)
  return t ? { id: t.id, term: t.term, reading: t.reading ?? null, summary: t.summary } : null
})
