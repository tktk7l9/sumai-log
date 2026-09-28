import { eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { vendors } from '../../db/schema'
import { parseBuildPlan, type BuildPlan, type VendorResearch } from '../../lib/research'
import { readSetting, writeSetting } from './settings'

/**
 * Replaces the research memo (null clears it). It is content written by a person, so
 * updated_at is touched too and the vendor surfaces in the home "最近の更新" (Recent updates)
 * (the opposite policy from markNewsFetched of the automatic fetch).
 */
export async function setVendorResearch(
  db: Db,
  id: string,
  research: VendorResearch | null,
): Promise<void> {
  await db
    .update(vendors)
    .set({ research, updatedAt: sql`(datetime('now'))` })
    .where(eq(vendors.id, id))
}

/** The setting `buildPlan`. null if not set or broken */
export async function readBuildPlan(db: Db): Promise<BuildPlan | null> {
  return parseBuildPlan(await readSetting(db, 'buildPlan'))
}

export async function writeBuildPlan(db: Db, plan: BuildPlan): Promise<void> {
  await writeSetting(db, 'buildPlan', JSON.stringify(plan))
}
