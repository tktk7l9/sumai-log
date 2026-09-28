import type { Db } from '../../db/client'
import { normalizePlan, parseSitePlan, type SitePlan } from '../../lib/sitePlan'
import { readSetting, writeSetting } from './settings'

/** The setting `sitePlan`. null if not set or broken */
export async function readSitePlan(db: Db): Promise<SitePlan | null> {
  return parseSitePlan(await readSetting(db, 'sitePlan'))
}

/** Clamps back inside the land and lot before saving (no out-of-range value left by a UI rounding miss) */
export async function writeSitePlan(db: Db, plan: SitePlan): Promise<SitePlan> {
  const normalized = normalizePlan(plan)
  await writeSetting(db, 'sitePlan', JSON.stringify(normalized))
  return normalized
}
