import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'

import * as schema from '../../db/schema'

export const db = drizzle(env.DB, { schema })
export const actor = 'owner@example.com'

/**
 * Empties all tables. Must cover every table in db/schema.ts
 * (so that the tests of later tasks can start from a clean state).
 */
export async function reset() {
  for (const t of [
    'photos',
    'visits',
    'events',
    'videos',
    'works',
    'channel_videos',
    'comments',
    'tags',
    'sources',
    'places',
    'inbound_mails',
    'vendor_news',
    'vendors',
    'properties',
    'settings',
    'geocode_cache',
  ]) {
    await env.DB.exec(`DELETE FROM ${t}`)
  }
}
