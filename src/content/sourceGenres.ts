/**
 * 情報源（/sources）のジャンル。ここは **データだけ**（関数を置かない。解決・グルーピングは
 * `src/lib/sources.ts`）。affiliations.ts と同じ構成。
 *
 * 配列の並び順がそのまま一覧の表示順になる（0 件のジャンルは一覧側で隠す）。
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
  /** 表示名 */
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
