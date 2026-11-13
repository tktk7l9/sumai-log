import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { readBuildPlan, readSavedSitePlan, writeSitePlan } from './repository'
import { sitePlanInput, sitePlanSaveInput } from './sitePlan.schema'

export { sitePlanInput, sitePlanSaveInput }

/**
 * Initial display of the site plan simulator: the saved plan with the time it was saved (sent
 * back with the save), and the build plan (tsubo) for the building's defaults
 */
export const getSitePlan = createServerFn().handler(async () => {
  const db = getDb()
  const [saved, buildPlan] = await Promise.all([readSavedSitePlan(db), readBuildPlan(db)])
  return { ...saved, buildPlan }
})

/** { conflict: true } when the other person saved after this page loaded (nothing is written) */
export const saveSitePlan = createServerFn({ method: 'POST' })
  .validator(sitePlanSaveInput)
  .handler(({ data }) => writeSitePlan(getDb(), data.plan, data.expectedUpdatedAt))
