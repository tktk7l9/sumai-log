import { describe, expect, it } from 'vitest'

import { DEFAULT_SITE_PLAN } from '../lib/sitePlan'
import { sitePlanInput } from './sitePlan.schema'

describe('sitePlanInput', () => {
  it('既定値は通る', () => {
    expect(sitePlanInput.safeParse(DEFAULT_SITE_PLAN).success).toBe(true)
  })

  it('知らない方角・負の寸法・版違いは弾く', () => {
    expect(sitePlanInput.safeParse({ ...DEFAULT_SITE_PLAN, roadSide: 'X' }).success).toBe(false)
    expect(sitePlanInput.safeParse({ ...DEFAULT_SITE_PLAN, sectionX: -1 }).success).toBe(false)
    expect(sitePlanInput.safeParse({ ...DEFAULT_SITE_PLAN, version: 2 }).success).toBe(false)
  })
})
