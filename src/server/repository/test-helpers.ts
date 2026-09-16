import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'

import * as schema from '../../db/schema'

export const db = drizzle(env.DB, { schema })
export const actor = 'owner@example.com'

/**
 * 全テーブルを空にする。db/schema.ts の全テーブルを網羅すること
 * （後続タスクのテストがクリーンな状態から始められるように）。
 */
export async function reset() {
  for (const t of [
    'photos',
    'visits',
    'events',
    'videos',
    'comments',
    'tags',
    'sources',
    'places',
    'vendor_news',
    'vendors',
    'properties',
    'settings',
    'geocode_cache',
  ]) {
    await env.DB.exec(`DELETE FROM ${t}`)
  }
}
