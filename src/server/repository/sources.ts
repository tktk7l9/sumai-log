import { asc, eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { sources, vendors, type NewSource, type Source } from '../../db/schema'
import { DUPLICATE_URL_ERROR } from '../../lib/sources'

type SourceInputRow = Omit<NewSource, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & {
  id?: string
}

/** The message for when the id to update is already gone (e.g. the other device deleted it
 * first). Thrown as an exception that means "not there", equivalent to 404 (the caller of
 * saveSource shows it in a toast as is via extractFormError) */
export const SOURCE_NOT_FOUND_ERROR = '情報源が見つかりません（既に削除されている可能性があります）'

/** Identifies a D1 (SQLite) UNIQUE constraint violation, only the one on sources.url.
 * drizzle-orm/d1 holds the actual SQLite error in `error.cause` (DrizzleQueryError#cause)
 * (`error.message` is the executed SQL statement itself). The message has the form
 * `D1_ERROR: UNIQUE constraint failed: sources.url: SQLITE_CONSTRAINT …`. */
function isDuplicateUrlError(e: unknown): boolean {
  const cause = e instanceof Error ? (e as { cause?: unknown }).cause : undefined
  const message = cause instanceof Error ? cause.message : e instanceof Error ? e.message : ''
  return message.includes('UNIQUE constraint failed: sources.url')
}

/**
 * Creates when there is no id, updates when there is. The creator is recorded only on the
 * first save (same shape as videos.ts).
 * - If it is an update but the target id is already gone, throws `SOURCE_NOT_FOUND_ERROR`
 *   (until now a 0-row update was silently treated as success)
 * - A UNIQUE constraint violation on url (can happen on both create and update) is
 *   rephrased as `DUPLICATE_URL_ERROR` and thrown. SourceForm.tsx looks at this wording
 *   and shows a field error on the URL field
 */
export async function upsertSource(
  db: Db,
  input: SourceInputRow,
  actorEmail: string,
): Promise<string> {
  const { id, ...values } = input
  try {
    if (!id) {
      const newId = crypto.randomUUID()
      await db.insert(sources).values({ ...values, id: newId, createdBy: actorEmail })
      return newId
    }
    const updated = await db
      .update(sources)
      .set({ ...values, updatedAt: sql`(datetime('now'))` })
      .where(eq(sources.id, id))
      .returning({ id: sources.id })
    if (updated.length === 0) throw new Error(SOURCE_NOT_FOUND_ERROR)
    return id
  } catch (e) {
    if (isDuplicateUrlError(e)) throw new Error(DUPLICATE_URL_ERROR)
    throw e
  }
}

/** Deletes a source. If there is no row, does nothing and returns null (unlike
 * deleteVideoCascade in videos.ts, this one tells the caller "was it deleted" through the
 * return value. Same shape as deletePhotoRow in src/server/repository/photos.ts: check
 * existence with select, then delete, and return the deleted row or null).
 * The repository side uses this name so that it does not clash with the createServerFn
 * wrapper in sources.ts (public name deleteSource) (same reason as deleteVideoCascade in
 * videos.ts) */
export async function deleteSourceRow(db: Db, id: string): Promise<Source | null> {
  const [row] = await db.select().from(sources).where(eq(sources.id, id)).limit(1)
  if (!row) return null
  await db.delete(sources).where(eq(sources.id, id))
  return row
}

/** List: attaches the vendor name, in sort order (sortOrder ascending -> name). The sorting
 * itself is done per genre by groupSourcesByGenre in src/lib/sources.ts, so the order here
 * is enough as long as "which comes first within the same genre" is already right */
export async function listSourcesWithLinks(
  db: Db,
): Promise<(Source & { vendorName: string | null })[]> {
  const rows = await db
    .select({ source: sources, vendorName: vendors.name })
    .from(sources)
    .leftJoin(vendors, eq(sources.vendorId, vendors.id))
    .orderBy(asc(sources.sortOrder), asc(sources.name))
  return rows.map((r) => ({ ...r.source, vendorName: r.vendorName ?? null }))
}
