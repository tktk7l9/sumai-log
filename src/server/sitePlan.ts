import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { readBuildPlan, readSitePlan, writeSitePlan } from './repository'
import { sitePlanInput } from './sitePlan.schema'

export { sitePlanInput }

/** Initial display of the site plan simulator. The build plan (tsubo) is used for the building's defaults */
export const getSitePlan = createServerFn().handler(async () => {
  const db = getDb()
  const [plan, buildPlan] = await Promise.all([readSitePlan(db), readBuildPlan(db)])
  return { plan, buildPlan }
})

export const saveSitePlan = createServerFn({ method: 'POST' })
  .validator(sitePlanInput)
  .handler(async ({ data }) => ({ ok: true as const, plan: await writeSitePlan(getDb(), data) }))
