/**
 * Genres of the sources (/sources). This file holds **data only** (no functions.
 * Resolution and grouping are in `src/lib/sources.ts`). Same structure as affiliations.ts.
 *
 * The array order is the display order of the list as is (genres with 0 items are hidden
 * on the list side).
 */
export type SourceGenre = {
  id:
    | 'candidates'
    | 'associations'
    | 'knowledge'
    | 'builders'
    | 'hm'
    | 'condo-reno'
    | 'money'
    | 'energy'
    | 'owners'
  /** Display name */
  label: string
}

export const SOURCE_GENRES: readonly SourceGenre[] = [
  { id: 'candidates', label: '候補の会社' },
  { id: 'associations', label: '加盟団体' },
  { id: 'knowledge', label: '家づくりの知識' },
  { id: 'builders', label: '他地域の工務店・設計' },
  { id: 'hm', label: 'ハウスメーカー比較' },
  { id: 'condo-reno', label: 'マンション・リノベ' },
  { id: 'money', label: 'お金・ローン' },
  { id: 'energy', label: '太陽光・省エネ' },
  { id: 'owners', label: '施主の記録' },
] as const

export type SourceGenreId = SourceGenre['id']

export const SOURCE_GENRE_IDS = SOURCE_GENRES.map((g) => g.id) as [
  SourceGenreId,
  ...SourceGenreId[],
]
