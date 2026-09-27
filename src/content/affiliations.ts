/**
 * Data of the organizations vendors are members of. This file holds **data only** (no
 * functions. Resolution is in `src/lib/affiliations.ts`).
 *
 * Linked to the corresponding glossary term (`src/content/glossary.ts`) by `glossaryId`.
 */

export type Affiliation = {
  id: 'iedukuri100' | 'miratsugu' | 'kouzou-cram'
  /** Official name */
  name: string
  /** Common name */
  shortName: string
  /** Official site */
  url: string
  /** Glossary id (/glossary/$termId) */
  glossaryId: string
  /** The day the content was checked */
  checkedOn: string
}

export const AFFILIATIONS: readonly Affiliation[] = [
  {
    id: 'iedukuri100',
    name: '家づくり百貨',
    shortName: '家百',
    url: 'https://iedukuri100.com/',
    glossaryId: 'iedukuri100',
    checkedOn: '2026-09-16',
  },
  {
    id: 'miratsugu',
    name: '未来へつなぐ工務店の会',
    shortName: 'みらつぐ',
    url: 'https://miratsugu.com/',
    glossaryId: 'miratsugu',
    checkedOn: '2026-09-16',
  },
  {
    id: 'kouzou-cram',
    name: '構造塾 家づくり応援・業者マップ',
    shortName: '構造塾マップ',
    url: 'https://kouzou-cram.com/',
    glossaryId: 'kouzou-cram',
    checkedOn: '2026-09-16',
  },
] as const

export type AffiliationId = Affiliation['id']

export const AFFILIATION_IDS = AFFILIATIONS.map((a) => a.id) as [AffiliationId, ...AffiliationId[]]
