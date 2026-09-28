import { describe, expect, it } from 'vitest'

import { DEFAULT_SITE_PLAN } from '../lib/sitePlan'
import { sitePlanInput } from './sitePlan.schema'

describe('sitePlanInput', () => {
  it('the default value passes', () => {
    expect(sitePlanInput.safeParse(DEFAULT_SITE_PLAN).success).toBe(true)
  })

  it('rejects an unknown direction, a negative dimension and a different version', () => {
    expect(sitePlanInput.safeParse({ ...DEFAULT_SITE_PLAN, roadSide: 'X' }).success).toBe(false)
    expect(sitePlanInput.safeParse({ ...DEFAULT_SITE_PLAN, sectionX: -1 }).success).toBe(false)
    expect(sitePlanInput.safeParse({ ...DEFAULT_SITE_PLAN, version: 2 }).success).toBe(false)
  })
})
