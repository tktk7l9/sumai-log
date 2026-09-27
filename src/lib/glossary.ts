/**
 * Search, categorisation and related terms for the glossary. It holds no data
 * (`src/content/glossary.ts`) and is made of pure functions that look only at the array passed in.
 */

import { GLOSSARY_CATEGORIES, type GlossaryCategory, type GlossaryTerm } from '../content/glossary'

/**
 * Normalisation of the search key.
 * - NFKC: brings full-width alphanumerics and half-width kana to the standard form
 *   ("ＵＡ" -> "UA", "ｱﾙﾌｧ" -> "アルファ")
 * - Lowercasing: treats "UA" and "ua" as the same
 * - Whitespace removal: lets a mistyped query such as "ア ル ファ" still match
 * - Katakana -> hiragana: treats the reading (hiragana) and the term name (katakana) as equal
 */
function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/gu, '')
    .replace(/[ァ-ヶ]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

/**
 * The search covers only term name, reading, aliases and one-line definition. The body is
 * excluded because a hit on a word that appears just once in the body would list loosely
 * related terms. The separator "|" is a character normalize does not remove, so no false
 * match spans two fields.
 */
function searchKey(term: GlossaryTerm): string {
  return normalize([term.term, term.reading ?? '', term.summary, ...(term.aliases ?? [])].join('|'))
}

export function searchGlossary(terms: readonly GlossaryTerm[], query: string): GlossaryTerm[] {
  const q = normalize(query)
  if (!q) return [...terms]
  return terms.filter((term) => searchKey(term).includes(q))
}

export type GlossaryGroup = { category: GlossaryCategory; terms: GlossaryTerm[] }

/**
 * Groups by category. Categories follow `GLOSSARY_CATEGORIES`; within a category the order
 * passed in is kept. Categories with 0 matches are dropped (prevents search results from
 * listing empty headings only).
 */
export function groupByCategory(terms: readonly GlossaryTerm[]): GlossaryGroup[] {
  const groups: GlossaryGroup[] = []
  for (const category of GLOSSARY_CATEGORIES) {
    const matched = terms.filter((term) => term.category === category.id)
    if (matched.length > 0) groups.push({ category, terms: matched })
  }
  return groups
}

export function findTerm(terms: readonly GlossaryTerm[], id: string): GlossaryTerm | null {
  return terms.find((term) => term.id === id) ?? null
}

/**
 * Resolves the ids in `related` to terms. Unknown ids are silently discarded so a forgotten
 * data fix does not crash
 */
export function relatedTerms(terms: readonly GlossaryTerm[], term: GlossaryTerm): GlossaryTerm[] {
  return (term.related ?? []).flatMap((id) => {
    const found = findTerm(terms, id)
    return found ? [found] : []
  })
}

/**
 * Lookup table for jumping to the glossary from the badges on a candidate card (UA value,
 * C value, seismic grade, long-life quality housing)
 */
export type GlossaryMetric = 'ua' | 'c' | 'seismic' | 'longTerm'

const METRIC_TERM_ID: Record<GlossaryMetric, string> = {
  ua: 'ua-value',
  c: 'c-value',
  seismic: 'seismic-grade',
  longTerm: 'long-term-housing',
}

export function termIdForMetric(metric: GlossaryMetric): string {
  return METRIC_TERM_ID[metric]
}

/**
 * Picks 1 term at random from the glossary (the "用語集から" (From the glossary) section on the
 * home screen. A different term appears on every open and every pull-to-refresh). `random` is
 * a function returning [0, 1) (replaced from tests). Returns null for an empty array.
 */
export function pickRandomTerm(
  terms: readonly GlossaryTerm[],
  random: () => number = Math.random,
): GlossaryTerm | null {
  if (terms.length === 0) return null
  const index = Math.min(terms.length - 1, Math.floor(random() * terms.length))
  return terms[index]
}
