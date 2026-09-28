import { describe, expect, it } from 'vitest'

import { buildPlanInput, vendorResearchInput } from './research.schema'

/**
 * saveVendorResearch / saveBuildPlan are wrapped in createServerFn, so here only the
 * validator (zod) is checked directly (same pattern as events.worker-test.ts).
 */
describe('vendorResearchInput', () => {
  const base = {
    version: 1 as const,
    researchedOn: '2030-01-05',
    summary: 'テストの一言',
    facts: { founded: '1966 年・テスト市', scale: '' },
    sections: [{ title: '強み', body: '本文' }],
    sources: [{ label: '公式', url: 'https://example.com/' }],
  }

  it('drops empty facts and passes the rest through as is', () => {
    const result = vendorResearchInput.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.facts).toEqual({ founded: '1966 年・テスト市' })
      expect(result.data.sections).toEqual([{ title: '強み', body: '本文' }])
    }
  })

  it('passes even when facts is omitted', () => {
    const { facts: _facts, ...rest } = base
    expect(vendorResearchInput.safeParse(rest).success).toBe(true)
  })

  it('citation URLs are https only', () => {
    expect(
      vendorResearchInput.safeParse({
        ...base,
        sources: [{ label: '公式', url: 'http://example.com/' }],
      }).success,
    ).toBe(false)
  })

  it('rejects a section whose heading or body is empty', () => {
    expect(
      vendorResearchInput.safeParse({ ...base, sections: [{ title: '', body: '本文' }] }).success,
    ).toBe(false)
    expect(
      vendorResearchInput.safeParse({ ...base, sections: [{ title: '強み', body: ' ' }] }).success,
    ).toBe(false)
  })

  it('rejects unknown facts keys', () => {
    expect(vendorResearchInput.safeParse({ ...base, facts: { unknown: 'x' } }).success).toBe(false)
  })
})

describe('buildPlanInput', () => {
  it('single-story, 30-35 tsubo, budget 60 million yen', () => {
    const result = buildPlanInput.safeParse({
      floors: 1,
      tsuboMin: 30,
      tsuboMax: 35,
      budgetManYen: 6000,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.budgetManYen).toBe(6000)
  })

  it('budget is null when blank ("" from NumberInput)', () => {
    const result = buildPlanInput.safeParse({
      floors: 2,
      tsuboMin: 30,
      tsuboMax: 30,
      budgetManYen: '',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.budgetManYen).toBeNull()
  })

  it('tsubo: lower bound <= upper bound; floors: 1 or 2', () => {
    expect(
      buildPlanInput.safeParse({ floors: 1, tsuboMin: 40, tsuboMax: 35, budgetManYen: null })
        .success,
    ).toBe(false)
    expect(
      buildPlanInput.safeParse({ floors: 3, tsuboMin: 30, tsuboMax: 35, budgetManYen: null })
        .success,
    ).toBe(false)
  })
})
