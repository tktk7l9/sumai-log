import type { Db } from '../db/client'
import { buildGsiUrl, normalizeAddress, parseGsiResponse, type GeocodeHit } from '../lib/geocode'
import { getCachedGeocode, putCachedGeocode } from './repository'

export type GeocodeResult = (GeocodeHit & { source: 'gsi' | 'cache' }) | null

/**
 * 住所→座標。キャッシュ→国土地理院の順。国土地理院は 5 秒で諦める。
 * 失敗は null（画面側は「座標を手貼りしてください」に落とす）。
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
