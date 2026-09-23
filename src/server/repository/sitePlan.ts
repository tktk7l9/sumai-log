import type { Db } from '../../db/client'
import { normalizePlan, parseSitePlan, type SitePlan } from '../../lib/sitePlan'
import { readSetting, writeSetting } from './settings'

/** 設定 `sitePlan`。未設定・壊れていれば null */
export async function readSitePlan(db: Db): Promise<SitePlan | null> {
  return parseSitePlan(await readSetting(db, 'sitePlan'))
}

/** 保存前に土地・区画の中へ収め直す（画面の丸め漏れで範囲外の値を残さない） */
export async function writeSitePlan(db: Db, plan: SitePlan): Promise<SitePlan> {
  const normalized = normalizePlan(plan)
  await writeSetting(db, 'sitePlan', JSON.stringify(normalized))
  return normalized
}
