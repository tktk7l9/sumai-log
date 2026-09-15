import { eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { geocodeCache } from '../../db/schema'
import type { GeocodeHit } from '../../lib/geocode'

export async function getCachedGeocode(db: Db, query: string): Promise<GeocodeHit | null> {
  const [row] = await db.select().from(geocodeCache).where(eq(geocodeCache.query, query)).limit(1)
  return row ? { lat: row.lat, lng: row.lng, title: row.title } : null
}

export async function putCachedGeocode(db: Db, query: string, hit: GeocodeHit): Promise<void> {
  await db
    .insert(geocodeCache)
    .values({ query, lat: hit.lat, lng: hit.lng, title: hit.title })
    .onConflictDoUpdate({
      target: geocodeCache.query,
      set: { lat: hit.lat, lng: hit.lng, title: hit.title, fetchedAt: sql`(datetime('now'))` },
    })
}
