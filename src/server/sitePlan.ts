import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { readBuildPlan, readSitePlan, writeSitePlan } from './repository'
import { sitePlanInput } from './sitePlan.schema'

export { sitePlanInput }

/** 区画シミュレーターの初期表示。建築計画（坪数）は建物の既定値に使う */
export const getSitePlan = createServerFn().handler(async () => {
  const db = getDb()
  const [plan, buildPlan] = await Promise.all([readSitePlan(db), readBuildPlan(db)])
  return { plan, buildPlan }
})

export const saveSitePlan = createServerFn({ method: 'POST' })
  .validator(sitePlanInput)
  .handler(async ({ data }) => ({ ok: true as const, plan: await writeSitePlan(getDb(), data) }))
