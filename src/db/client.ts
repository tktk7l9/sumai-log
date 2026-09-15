import { drizzle } from 'drizzle-orm/d1'
import { env } from 'cloudflare:workers'

import * as schema from './schema'

/**
 * D1 への接続。サーバー側（server function / API ルート）からのみ呼ぶこと。
 * バインディングは wrangler.jsonc の d1_databases で定義している。
 */
export function getDb() {
  return drizzle(env.DB, { schema })
}

export type Db = ReturnType<typeof getDb>
