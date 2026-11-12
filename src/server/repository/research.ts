import { and, eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { vendors } from '../../db/schema'
import { parseBuildPlan, type BuildPlan, type VendorResearch } from '../../lib/research'
import { readSetting, writeSetting } from './settings'
import { assertUpdated } from './stale'

/**
 * Replaces the research memo (null clears it). It is content written by a person, so
 * updated_at is touched too and the vendor surfaces in the home "最近の更新" (Recent updates)
 * (the opposite policy from markNewsFetched of the automatic fetch).
 *
 * The whole JSON is replaced, so with expectedUpdatedAt (the vendor's updated_at when the form
 * was opened) it throws StaleWriteError instead of writing over what the other person saved
 * in between (stale.ts). The stamp is the vendor row's: a save of the vendor form in between
 * also counts, and this save in turn makes an open vendor form stale. The automatic fetches
 * (markNewsFetched, the favicon and photo setters) do not move it.
 */
export async function setVendorResearch(
  db: Db,
  id: string,
  research: VendorResearch | null,
  expectedUpdatedAt?: string | null,
): Promise<void> {
  const rows = await db
    .update(vendors)
    .set({ research, updatedAt: sql`(datetime('now'))` })
    .where(
      expectedUpdatedAt
        ? and(eq(vendors.id, id), eq(vendors.updatedAt, expectedUpdatedAt))
        : eq(vendors.id, id),
    )
    .returning({ id: vendors.id })
  assertUpdated(rows, expectedUpdatedAt)
}

/** The setting `buildPlan`. null if not set or broken */
export async function readBuildPlan(db: Db): Promise<BuildPlan | null> {
  return parseBuildPlan(await readSetting(db, 'buildPlan'))
}

export async function writeBuildPlan(db: Db, plan: BuildPlan): Promise<void> {
  await writeSetting(db, 'buildPlan', JSON.stringify(plan))
}
