import type { Db } from '../db/client'
import { buildGsiUrl, normalizeAddress, parseGsiResponse, type GeocodeHit } from '../lib/geocode'
import { getCachedGeocode, putCachedGeocode } from './repository'

export type GeocodeResult = (GeocodeHit & { source: 'gsi' | 'cache' }) | null

/**
 * Address -> coordinates. Order: cache -> Geospatial Information Authority of Japan (GSI).
 * GSI is given up on after 5 seconds.
 * Failure is null (the screen side falls back to "paste the coordinates by hand").
 */
export async function geocodeAddress(
  db: Db,
  rawQuery: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeocodeResult> {
  const query = normalizeAddress(rawQuery)
  if (!query) return null
  const cached = await getCachedGeocode(db, query)
  if (cached) return { ...cached, source: 'cache' }

  let hit: GeocodeHit | null = null
  try {
    const res = await fetchImpl(buildGsiUrl(query), {
      signal: AbortSignal.timeout(5000),
      headers: { accept: 'application/json' },
    })
    if (res.ok) hit = parseGsiResponse(await res.json())
  } catch {
    hit = null
  }
  if (!hit) return null
  await putCachedGeocode(db, query, hit)
  return { ...hit, source: 'gsi' }
}
