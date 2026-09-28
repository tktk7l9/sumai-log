import { createServerFn } from '@tanstack/react-start'

import { GLOSSARY } from '../content/glossary'
import { pickRandomTerm } from '../lib/glossary'

export type GlossaryPick = { id: string; term: string; reading: string | null; summary: string }

/**
 * "用語集から" (From the glossary) on the home page. 1 random term on every load (owner's
 * request, 2026-09-19. Originally it changed daily). The loader runs on the server and the
 * result is embedded in the HTML, so hydration does not flicker.
 * Returns only the 4 fields needed for display, to keep the whole glossary out of the home bundle.
 */
export const pickGlossaryTerm = createServerFn().handler(async (): Promise<GlossaryPick | null> => {
  const t = pickRandomTerm(GLOSSARY)
  return t ? { id: t.id, term: t.term, reading: t.reading ?? null, summary: t.summary } : null
})
