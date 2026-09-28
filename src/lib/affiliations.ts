/**
 * Resolution of member organizations. Holds no data (`src/content/affiliations.ts`); pure
 * functions that only look up by id.
 */

import { AFFILIATIONS, type Affiliation } from '../content/affiliations'

export function findAffiliation(id: string): Affiliation | null {
  return AFFILIATIONS.find((a) => a.id === id) ?? null
}

/**
 * Resolves the `affiliations` of a vendor (array of ids) to organizations.
 * So that a forgotten data fix does not crash it, unknown ids are silently dropped, the
 * order stays as given, and duplicates are removed.
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
