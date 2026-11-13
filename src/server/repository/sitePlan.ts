import { and, eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { settings } from '../../db/schema'
import { normalizePlan, parseSitePlan, type SitePlan } from '../../lib/sitePlan'

const KEY = 'sitePlan'

/**
 * The setting `sitePlan` with the time its row was last written. The plan is null if not set
 * or broken; updatedAt is null only while there is no row. The page sends updatedAt back with
 * its save (see writeSitePlan)
 */
export async function readSavedSitePlan(
  db: Db,
): Promise<{ plan: SitePlan | null; updatedAt: string | null }> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1)
  return { plan: parseSitePlan(row?.value), updatedAt: row?.updatedAt ?? null }
}

/** The setting `sitePlan`. null if not set or broken */
export async function readSitePlan(db: Db): Promise<SitePlan | null> {
  return (await readSavedSitePlan(db)).plan
}

export type SitePlanSaveResult =
  { conflict: false; plan: SitePlan; updatedAt: string } | { conflict: true }

/**
 * Clamps back inside the land and lot before saving (no out-of-range value left by a UI
 * rounding miss), and writes only on top of the version the page loaded: the plan is one
 * value shared by the two, so an unconditional write replaced everything the other person
 * had saved since, the hand-entered neighbouring buildings included. Same mechanism as
 * stale.ts, on the settings row: expectedUpdatedAt is the row's updated_at the page loaded
 * (null = it loaded no row, so the row must still not exist), and 0 rows written is a
 * conflict. The row is stamped by D1's datetime('now') like every other settings write, so
 * the column keeps one format and the comparison stays a plain string match
 */
export async function writeSitePlan(
  db: Db,
  plan: SitePlan,
  expectedUpdatedAt: string | null,
): Promise<SitePlanSaveResult> {
  const normalized = normalizePlan(plan)
  const value = JSON.stringify(normalized)
  const stamp = { updatedAt: settings.updatedAt }
  const [row] =
    expectedUpdatedAt === null
      ? await db.insert(settings).values({ key: KEY, value }).onConflictDoNothing().returning(stamp)
      : await db
          .update(settings)
          .set({ value, updatedAt: sql`(datetime('now'))` })
          .where(and(eq(settings.key, KEY), eq(settings.updatedAt, expectedUpdatedAt)))
          .returning(stamp)
  return row ? { conflict: false, plan: normalized, updatedAt: row.updatedAt } : { conflict: true }
}
