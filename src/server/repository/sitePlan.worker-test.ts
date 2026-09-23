import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SITE_PLAN } from '../../lib/sitePlan'
import { writeSetting } from './settings'
import { readSitePlan, writeSitePlan } from './sitePlan'
import { db, reset } from './test-helpers'

beforeEach(reset)

describe('sitePlan', () => {
  it('保存時に範囲へ収め、JSON で往復する。壊れた値は null', async () => {
    expect(await readSitePlan(db)).toBeNull()
    const saved = await writeSitePlan(db, { ...DEFAULT_SITE_PLAN, sectionY: 999 })
    expect(saved.sectionY).toBeLessThan(50)
    expect(await readSitePlan(db)).toEqual(saved)
    await writeSetting(db, 'sitePlan', '{broken')
    expect(await readSitePlan(db)).toBeNull()
  })
})
