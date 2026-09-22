import { eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { vendors } from '../../db/schema'
import { parseBuildPlan, type BuildPlan, type VendorResearch } from '../../lib/research'
import { readSetting, writeSetting } from './settings'

/**
 * 調査メモを差し替える（null で消す）。人が書く内容なので updated_at も動かし、
 * ホームの「最近の更新」に業者として浮上させる（自動取得の markNewsFetched とは逆の方針）。
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

/** 設定 `buildPlan`。未設定・壊れていれば null */
export async function readBuildPlan(db: Db): Promise<BuildPlan | null> {
  return parseBuildPlan(await readSetting(db, 'buildPlan'))
}

export async function writeBuildPlan(db: Db, plan: BuildPlan): Promise<void> {
  await writeSetting(db, 'buildPlan', JSON.stringify(plan))
}
