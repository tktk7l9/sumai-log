import { beforeEach, describe, expect, it } from 'vitest'

import { setVendorFaviconKey, setVendorRepresentativePhotoKey, upsertVendor } from './candidates'
import { markNewsFetched } from './news'
import { readBuildPlan, setVendorResearch, writeBuildPlan } from './research'
import { writeSetting } from './settings'
import { StaleWriteError } from './stale'
import { actor, db, reset } from './test-helpers'
import { vendors } from '../../db/schema'
import { eq, sql } from 'drizzle-orm'

beforeEach(reset)

const vendorInput = {
  name: 'テスト工務店',
  kind: 'koumuten' as const,
  hq: null,
  representative: null,
  serviceAreas: [],
  affiliations: [],
  affiliationLinks: {},
  uaValue: null,
  cValuePublished: false,
  seismicGrade: null,
  longTermCertified: false,
  pricePerTsuboMin: null,
  pricePerTsuboMax: null,
  structure: null,
  features: null,
  status: 'interested' as const,
  sourceUrl: null,
  websiteUrl: null,
  socialUrls: [],
  newsUrl: null,
  newsSource: null,
  newsEmailDomain: null,
}

describe('research', () => {
  it('the research memo round-trips as JSON and null clears it. Saving the vendor form does not erase it', async () => {
    const id = await upsertVendor(db, vendorInput, actor)
    const research = {
      version: 1 as const,
      researchedOn: '2030-01-05',
      summary: '一言',
      facts: { hiraya: '実績あり' },
      sections: [{ title: '強み', body: '本文' }],
      sources: [{ label: '公式', url: 'https://example.com/' }],
    }
    await setVendorResearch(db, id, research)
    let [row] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(row.research).toEqual(research)

    // The vendor form (upsertVendor) does not carry research, so it remains after an update
    await upsertVendor(db, { ...vendorInput, id, hq: 'テスト市' }, actor)
    ;[row] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(row.research).toEqual(research)
    expect(row.hq).toBe('テスト市')

    await setVendorResearch(db, id, null)
    ;[row] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(row.research).toBeNull()
  })

  const memo = (summary: string) => ({
    version: 1 as const,
    researchedOn: '2030-01-05',
    summary,
    facts: {},
    sections: [],
    sources: [],
  })
  const OPENED = '2030-01-01 00:00:00'
  /** A vendor last saved at OPENED: what both people see when they open the memo form */
  async function vendorOpenedByBoth(): Promise<string> {
    const id = await upsertVendor(db, vendorInput, actor)
    await db.run(sql`UPDATE vendors SET updated_at = ${OPENED} WHERE id = ${id}`)
    return id
  }
  const rowOf = async (id: string) =>
    (await db.select().from(vendors).where(eq(vendors.id, id)))[0]!

  it('does not replace the memo the other person saved after the form was opened', async () => {
    const id = await vendorOpenedByBoth()

    await setVendorResearch(db, id, memo('甲が書いた'), OPENED)
    const afterFirst = await rowOf(id)
    expect(afterFirst.research).toEqual(memo('甲が書いた'))
    // The save moves updated_at, which is what makes the second save stale
    expect(afterFirst.updatedAt).not.toBe(OPENED)

    await expect(setVendorResearch(db, id, memo('乙が書いた'), OPENED)).rejects.toBeInstanceOf(
      StaleWriteError,
    )
    await expect(setVendorResearch(db, id, null, OPENED)).rejects.toBeInstanceOf(StaleWriteError)
    expect((await rowOf(id)).research).toEqual(memo('甲が書いた'))

    // Saving again from the reloaded page (the current stamp) is a deliberate overwrite
    await setVendorResearch(db, id, memo('乙が書いた'), afterFirst.updatedAt)
    expect((await rowOf(id)).research).toEqual(memo('乙が書いた'))
  })

  it('is not made stale by the automatic fetches, which leave updated_at alone', async () => {
    const id = await vendorOpenedByBoth()
    await markNewsFetched(db, id, null)
    await setVendorFaviconKey(db, id, 'vendors/x/favicon-1.png', 'auto')
    await setVendorRepresentativePhotoKey(db, id, 'vendors/x/representative-1.jpg')

    await setVendorResearch(db, id, memo('甲が書いた'), OPENED)
    expect((await rowOf(id)).research).toEqual(memo('甲が書いた'))
  })

  it('writes without a check when no stamp is sent (the delete with undo)', async () => {
    const id = await vendorOpenedByBoth()
    await setVendorResearch(db, id, memo('甲が書いた'), OPENED)
    await setVendorResearch(db, id, null)
    expect((await rowOf(id)).research).toBeNull()
  })

  it('saves the build plan to settings, and turns a broken value into null', async () => {
    expect(await readBuildPlan(db)).toBeNull()
    await writeBuildPlan(db, { floors: 1, tsuboMin: 30, tsuboMax: 35, budgetManYen: 6000 })
    expect(await readBuildPlan(db)).toEqual({
      floors: 1,
      tsuboMin: 30,
      tsuboMax: 35,
      budgetManYen: 6000,
    })
    await writeSetting(db, 'buildPlan', '{broken')
    expect(await readBuildPlan(db)).toBeNull()
  })
})
