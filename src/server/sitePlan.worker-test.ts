import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { settings } from '../db/schema'
import {
  DEFAULT_SITE_PLAN,
  parseSitePlan,
  placeBuildingNorth,
  type Neighbor,
  type SitePlan,
} from '../lib/sitePlan'
import { writeSetting } from './repository/settings'
import { readSavedSitePlan, readSitePlan, writeSitePlan } from './repository/sitePlan'
import { db, reset } from './repository/test-helpers'
import { sitePlanInput, sitePlanSaveInput } from './sitePlan.schema'

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

  it('a save states which saved version it was based on (null before the first save)', () => {
    const plan = DEFAULT_SITE_PLAN
    expect(sitePlanSaveInput.safeParse({ plan, expectedUpdatedAt: null }).success).toBe(true)
    expect(
      sitePlanSaveInput.safeParse({ plan, expectedUpdatedAt: '2030-01-01 00:00:00' }).success,
    ).toBe(true)
    // A page from before the guard sends the bare plan: refused, not written unconditionally
    expect(sitePlanSaveInput.safeParse({ plan }).success).toBe(false)
    expect(sitePlanSaveInput.safeParse(plan).success).toBe(false)
  })
})

describe('saving the site plan', () => {
  it('returns from the save the same serialisation that the next read returns', async () => {
    // What a page that loaded an older saved value holds: parseSitePlan fills the later items
    // in first. It goes through the validator (schema key order) into the write
    const { roadWidth: _r, lotLines: _l, neighbors: _n, ...old } = DEFAULT_SITE_PLAN
    const onPage = placeBuildingNorth(parseSitePlan(JSON.stringify(old))!)
    const returned = await writeSitePlan(db, sitePlanInput.parse(onPage), null)
    const read = await readSitePlan(db)
    expect(returned.conflict).toBe(false)
    expect(JSON.stringify(returned.conflict ? null : returned.plan)).toBe(JSON.stringify(read))
    // And the page's own plan serialises the same, so "saved" is not shown as changed
    expect(JSON.stringify(read)).toBe(JSON.stringify(onPage))
  })

  const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
  const neighbor: Neighbor = {
    label: '北の家',
    kind: 'building',
    x: 0,
    y: 50,
    width: 8,
    depth: 6,
    height: 7,
  }
  const mine: SitePlan = { ...DEFAULT_SITE_PLAN, sectionWidth: 12 }
  const theirs: SitePlan = { ...DEFAULT_SITE_PLAN, neighbors: [neighbor] }
  const stampOf = async () => (await readSavedSitePlan(db)).updatedAt
  /** The other person saved: the row carries a later time than the one this page loaded */
  const otherSaved = async (at: string) => {
    await db.update(settings).set({ updatedAt: at }).where(eq(settings.key, 'sitePlan'))
  }

  it('the first save works when nothing is saved yet, and hands back the time to base the next save on', async () => {
    expect(await readSavedSitePlan(db)).toEqual({ plan: null, updatedAt: null })
    const first = await writeSitePlan(db, mine, null)
    expect(first).toMatchObject({ conflict: false, updatedAt: expect.stringMatching(STAMP) })
    const saved = await readSavedSitePlan(db)
    expect(saved.plan?.sectionWidth).toBe(12)
    expect(saved.updatedAt).toBe(first.conflict ? null : first.updatedAt)
    // The next save from the same page is based on that time
    const second = await writeSitePlan(db, { ...mine, sectionWidth: 10 }, saved.updatedAt)
    expect(second.conflict).toBe(false)
    expect((await readSitePlan(db))?.sectionWidth).toBe(10)
  })

  it('does not replace the plan the other person saved in the meantime', async () => {
    await writeSitePlan(db, theirs, null)
    // A first save from a page that opened before anything was saved
    expect(await writeSitePlan(db, mine, null)).toEqual({ conflict: true })
    // A save from a page that loaded an older version
    const loaded = await stampOf()
    await otherSaved('2031-01-01 00:00:00')
    expect(await writeSitePlan(db, mine, loaded)).toEqual({ conflict: true })
    const kept = await readSavedSitePlan(db)
    expect(kept.plan?.neighbors).toEqual([neighbor])
    expect(kept.plan?.sectionWidth).toBe(16)
    expect(kept.updatedAt).toBe('2031-01-01 00:00:00')
    // Saving again on top of the version that was shown goes through, and the row is stamped
    // by D1 again (the one format of the column)
    const again = await writeSitePlan(db, mine, kept.updatedAt)
    expect(again).toMatchObject({ conflict: false, updatedAt: expect.stringMatching(STAMP) })
    expect((await readSitePlan(db))?.sectionWidth).toBe(12)
  })

  it('a broken saved value can be replaced from the page that loaded it', async () => {
    await writeSetting(db, 'sitePlan', '{broken')
    const { plan, updatedAt } = await readSavedSitePlan(db)
    expect(plan).toBeNull()
    expect(updatedAt).toMatch(STAMP)
    expect((await writeSitePlan(db, mine, updatedAt)).conflict).toBe(false)
    expect((await readSitePlan(db))?.sectionWidth).toBe(12)
  })
})
