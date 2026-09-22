import { describe, expect, it } from 'vitest'

import { buildPlanInput, vendorResearchInput } from './research.schema'

/**
 * saveVendorResearch / saveBuildPlan は createServerFn でラップされているため、ここでは
 * validator（zod）だけを直接確かめる（events.worker-test.ts と同じパターン）。
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

  it('空の facts は落とし、それ以外はそのまま通す', () => {
    const result = vendorResearchInput.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.facts).toEqual({ founded: '1966 年・テスト市' })
      expect(result.data.sections).toEqual([{ title: '強み', body: '本文' }])
    }
  })

  it('facts を省略しても通る', () => {
    const { facts: _facts, ...rest } = base
    expect(vendorResearchInput.safeParse(rest).success).toBe(true)
  })

  it('出典の URL は https のみ', () => {
    expect(
      vendorResearchInput.safeParse({
        ...base,
        sources: [{ label: '公式', url: 'http://example.com/' }],
      }).success,
    ).toBe(false)
  })

  it('見出し・本文が空の節は弾く', () => {
    expect(
      vendorResearchInput.safeParse({ ...base, sections: [{ title: '', body: '本文' }] }).success,
    ).toBe(false)
    expect(
      vendorResearchInput.safeParse({ ...base, sections: [{ title: '強み', body: ' ' }] }).success,
    ).toBe(false)
  })

  it('知らない facts のキーは弾く', () => {
    expect(vendorResearchInput.safeParse({ ...base, facts: { unknown: 'x' } }).success).toBe(false)
  })
})

describe('buildPlanInput', () => {
  it('平屋 30〜35 坪・予算 6000 万円', () => {
    const result = buildPlanInput.safeParse({
      floors: 1,
      tsuboMin: 30,
      tsuboMax: 35,
      budgetManYen: 6000,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.budgetManYen).toBe(6000)
  })

  it('予算は空欄（NumberInput の ""）なら null', () => {
    const result = buildPlanInput.safeParse({
      floors: 2,
      tsuboMin: 30,
      tsuboMax: 30,
      budgetManYen: '',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.budgetManYen).toBeNull()
  })

  it('坪数は下限≦上限、階数は 1 か 2', () => {
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
