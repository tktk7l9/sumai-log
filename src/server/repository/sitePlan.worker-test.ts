import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SITE_PLAN } from '../../lib/sitePlan'
import { writeSetting } from './settings'
import { readSitePlan, writeSitePlan } from './sitePlan'
import { db, reset } from './test-helpers'

beforeEach(reset)

describe('sitePlan', () => {
  it('clamps into range on save and round-trips as JSON. A broken value is null', async () => {
    expect(await readSitePlan(db)).toBeNull()
    const saved = await writeSitePlan(db, { ...DEFAULT_SITE_PLAN, sectionY: 999 })
    expect(saved.sectionY).toBeLessThan(50)
    expect(await readSitePlan(db)).toEqual(saved)
    await writeSetting(db, 'sitePlan', '{broken')
    expect(await readSitePlan(db)).toBeNull()
  })
})
