import { sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { DEFAULT_TAGS, tags, type Tag } from '../../db/schema'

export async function listTags(db: Db): Promise<Tag[]> {
  return db.select().from(tags).orderBy(tags.sortOrder, tags.name)
}

/**
 * Adds only the missing names, with sortOrder at the end. Existing names and duplicate
 * names within the call are ignored. `onConflictDoNothing()` is insurance against the
 * race where another request inserts the same name first after the preceding select
 * (it hits the unique constraint on `tags.name`)
 */
export async function ensureTags(db: Db, names: string[]): Promise<void> {
  const existing = new Set((await db.select({ name: tags.name }).from(tags)).map((r) => r.name))
  const missing = [...new Set(names)].filter((n) => !existing.has(n))
  if (missing.length === 0) return
  const [row] = await db
    .select({ next: sql<number>`coalesce(max(${tags.sortOrder}), -1) + 1` })
    .from(tags)
  const base = Number(row?.next ?? 0)
  await db
    .insert(tags)
    .values(missing.map((name, i) => ({ id: crypto.randomUUID(), name, sortOrder: base + i })))
    .onConflictDoNothing()
}

/**
 * Full replacement with order = array order. tags on the video side is a string array
 * and does not reference the tags table, so it is not affected. delete and insert are
 * made 1 atomic unit with `db.batch`, so that a failure midway does not leave the state
 * where "only the delete-all took effect"
 */
export async function replaceTags(db: Db, names: string[]): Promise<void> {
  const unique = [...new Set(names)]
  if (unique.length === 0) {
    await db.delete(tags)
    return
  }
  await db.batch([
    db.delete(tags),
    db
      .insert(tags)
      .values(unique.map((name, i) => ({ id: crypto.randomUUID(), name, sortOrder: i }))),
  ])
}

/** Inserts the default tags (spec §3) only when there are 0 rows. Idempotent however often it is called */
export async function seedDefaultTags(db: Db): Promise<void> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(tags)
  if (Number(row?.n ?? 0) > 0) return
  await db
    .insert(tags)
    .values(DEFAULT_TAGS.map((name, i) => ({ id: crypto.randomUUID(), name, sortOrder: i })))
}
