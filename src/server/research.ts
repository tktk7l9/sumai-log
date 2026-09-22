import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { readBuildPlan, setVendorResearch, vendorExists, writeBuildPlan } from './repository'
import { buildPlanInput, saveVendorResearchInput, vendorResearchInput } from './research.schema'

// スキーマは research.schema.ts から（分離した理由はそちら）。公開 import パスは変えない
export { buildPlanInput, saveVendorResearchInput, vendorResearchInput }
export type { BuildPlanInput, VendorResearchInput } from './research.schema'

export const saveVendorResearch = createServerFn({ method: 'POST' })
  .validator(saveVendorResearchInput)
  .handler(async ({ data }) => {
    const db = getDb()
    if (!(await vendorExists(db, data.id))) throw new Response('Not Found', { status: 404 })
    await setVendorResearch(db, data.id, data.research)
    return { ok: true as const }
  })

export const getBuildPlan = createServerFn().handler(async () => ({
  plan: await readBuildPlan(getDb()),
}))

export const saveBuildPlan = createServerFn({ method: 'POST' })
  .validator(buildPlanInput)
  .handler(async ({ data }) => {
    await writeBuildPlan(getDb(), data)
    return { ok: true as const, plan: data }
  })
