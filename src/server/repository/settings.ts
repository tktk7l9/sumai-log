import { eq, like, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { settings } from '../../db/schema'
import { LAST_SEEN_PREFIX, emailFromLastSeenKey, lastSeenKey } from '../../lib/usage'

export async function readSetting(db: Db, key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
  return row?.value ?? null
}

export async function writeSetting(db: Db, key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: sql`(datetime('now'))` },
    })
}

export async function readHomeAreas(db: Db): Promise<string[]> {
  const raw = await readSetting(db, 'homeAreas')
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** A user's "最後に使った日時" (last used at), ISO 8601. Key `lastSeen:<email>` (src/lib/usage.ts) */
export async function writeLastSeen(db: Db, email: string, at: string): Promise<void> {
  await writeSetting(db, lastSeenKey(email), at)
}

/** Email (lowercase) -> last used at. People with no record are not included */
export async function readLastSeen(db: Db): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(like(settings.key, `${LAST_SEEN_PREFIX}%`))
  const result: Record<string, string> = {}
  for (const row of rows) {
    const email = emailFromLastSeenKey(row.key)
    if (email) result[email] = row.value
  }
  return result
}
