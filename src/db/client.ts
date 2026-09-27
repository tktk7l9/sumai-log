import { drizzle } from 'drizzle-orm/d1'
import { env } from 'cloudflare:workers'

import * as schema from './schema'

/**
 * Connection to D1. Call it only from the server side (server function / API route).
 * The binding is defined in d1_databases of wrangler.jsonc.
 */
export function getDb() {
  return drizzle(env.DB, { schema })
}

export type Db = ReturnType<typeof getDb>
