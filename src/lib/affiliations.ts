/**
 * 加盟団体の解決。データ（`src/content/affiliations.ts`）は持たず、id から引くだけの純粋関数。
 */

import { AFFILIATIONS, type Affiliation } from '../content/affiliations'

export function findAffiliation(id: string): Affiliation | null {
  return AFFILIATIONS.find((a) => a.id === id) ?? null
}

/**
 * 業者の `affiliations`（id の配列）を団体に解決する。
 * データの直し忘れで落ちないよう知らない id は黙って捨て、順序は渡した順のまま、重複は除く。
 */
export function resolveAffiliations(ids: readonly string[]): Affiliation[] {
  const seen = new Set<string>()
  const result: Affiliation[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const found = findAffiliation(id)
    if (found) result.push(found)
  }
  return result
}
