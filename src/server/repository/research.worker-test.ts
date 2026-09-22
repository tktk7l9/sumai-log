import { beforeEach, describe, expect, it } from 'vitest'

import { upsertVendor } from './candidates'
import { readBuildPlan, setVendorResearch, writeBuildPlan } from './research'
import { writeSetting } from './settings'
import { actor, db, reset } from './test-helpers'
import { vendors } from '../../db/schema'
import { eq } from 'drizzle-orm'

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
  it('調査メモを JSON で往復し、null で消せる。業者フォームの保存では消えない', async () => {
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

    // 業者フォーム（upsertVendor）は research を持たないので、更新しても残る
    await upsertVendor(db, { ...vendorInput, id, hq: 'テスト市' }, actor)
    ;[row] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(row.research).toEqual(research)
    expect(row.hq).toBe('テスト市')

    await setVendorResearch(db, id, null)
    ;[row] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(row.research).toBeNull()
  })

  it('建築計画を設定に保存し、壊れた値は null にする', async () => {
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
