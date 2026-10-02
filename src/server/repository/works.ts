import { asc, eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { vendors, works, type Work } from '../../db/schema'

/** watchedBy (an e-mail) stays in the table as a record; the screen does not use it, so it is not sent */
export type WorkRow = Omit<Work, 'watchedBy'> & { vendorName: string | null }

/** All works with the vendor name: vendor -> site -> the order on the site's own list */
export async function listWorksWithVendor(db: Db): Promise<WorkRow[]> {
  const rows = await db
    .select({ work: works, vendorName: vendors.name })
    .from(works)
    .leftJoin(vendors, eq(works.vendorId, vendors.id))
    .orderBy(sql`${vendors.name} IS NULL`, asc(vendors.name), asc(works.site), asc(works.sortOrder))
  return rows.map(({ work: { watchedBy: _watchedBy, ...work }, vendorName }) => ({
    ...work,
    vendorName: vendorName ?? null,
  }))
}

/**
 * One watched flag shared by the two users. No stale-write check: both setting it at the same
 * time ends in the same state. Returns false when the work is gone
 */
export async function setWorkWatched(
  db: Db,
  id: string,
  watched: boolean,
  actorEmail: string,
): Promise<boolean> {
  const rows = await db
    .update(works)
    .set({
      watchedAt: watched ? new Date().toISOString() : null,
      watchedBy: watched ? actorEmail : null,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(works.id, id))
    .returning({ id: works.id })
  return rows.length > 0
}

/** A video pasted by hand ('manual' survives re-imports). null removes it and lets the import fill it again */
export async function setWorkVideo(db: Db, id: string, videoId: string | null): Promise<boolean> {
  const rows = await db
    .update(works)
    .set({
      youtubeVideoId: videoId,
      videoSource: videoId ? 'manual' : null,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(works.id, id))
    .returning({ id: works.id })
  return rows.length > 0
}
