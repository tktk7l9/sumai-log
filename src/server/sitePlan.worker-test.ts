import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SITE_PLAN, parseSitePlan, placeBuildingNorth } from '../lib/sitePlan'
import { readSitePlan, writeSitePlan } from './repository/sitePlan'
import { db, reset } from './repository/test-helpers'
import { sitePlanInput } from './sitePlan.schema'

beforeEach(reset)

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

describe('saving the site plan', () => {
  it('returns from the save the same serialisation that the next read returns', async () => {
    // What a page that loaded an older saved value holds: parseSitePlan fills the later items
    // in first. It goes through the validator (schema key order) into the write
    const { roadWidth: _r, lotLines: _l, neighbors: _n, ...old } = DEFAULT_SITE_PLAN
    const onPage = placeBuildingNorth(parseSitePlan(JSON.stringify(old))!)
    const returned = await writeSitePlan(db, sitePlanInput.parse(onPage))
    const read = await readSitePlan(db)
    expect(JSON.stringify(returned)).toBe(JSON.stringify(read))
    // And the page's own plan serialises the same, so "saved" is not shown as changed
    expect(JSON.stringify(read)).toBe(JSON.stringify(onPage))
  })
})
