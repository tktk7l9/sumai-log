import { describe, expect, it } from 'vitest'

import {
  BODY_COST_SHARE,
  RESEARCH_FACT_KEYS,
  RESEARCH_FACT_LABEL,
  emptyResearch,
  estimateCost,
  formatManYen,
  formatManYenRange,
  formatTsuboRange,
  judgeBudget,
  parseBuildPlan,
  presentFacts,
} from './research'

describe('parseBuildPlan', () => {
  it('正しい JSON を読む', () => {
    expect(
      parseBuildPlan(JSON.stringify({ floors: 1, tsuboMin: 30, tsuboMax: 35, budgetManYen: 6000 })),
    ).toEqual({ floors: 1, tsuboMin: 30, tsuboMax: 35, budgetManYen: 6000 })
    expect(
      parseBuildPlan(JSON.stringify({ floors: 2, tsuboMin: 30, tsuboMax: 30, budgetManYen: null })),
    ).toEqual({ floors: 2, tsuboMin: 30, tsuboMax: 30, budgetManYen: null })
  })

  it('空・壊れた JSON・形の違う値は null', () => {
    expect(parseBuildPlan(null)).toBeNull()
    expect(parseBuildPlan(undefined)).toBeNull()
    expect(parseBuildPlan('')).toBeNull()
    expect(parseBuildPlan('{not json')).toBeNull()
    expect(parseBuildPlan('[]')).toBeNull()
    expect(parseBuildPlan('"str"')).toBeNull()
    expect(parseBuildPlan(JSON.stringify({ floors: 3, tsuboMin: 30, tsuboMax: 35 }))).toBeNull()
    expect(parseBuildPlan(JSON.stringify({ floors: 1, tsuboMin: '30', tsuboMax: 35 }))).toBeNull()
    expect(
      parseBuildPlan(
        JSON.stringify({ floors: 1, tsuboMin: 30, tsuboMax: 35, budgetManYen: '6000' }),
      ),
    ).toBeNull()
  })
})

describe('estimateCost', () => {
  const plan = { tsuboMin: 30, tsuboMax: 35 }

  it('坪単価の下限×坪数の下限〜上限×上限。総額は本体÷0.7', () => {
    const result = estimateCost({ pricePerTsuboMin: 80, pricePerTsuboMax: 100 }, plan)
    expect(result).toEqual({
      bodyMin: 2400,
      bodyMax: 3500,
      totalMin: Math.round(2400 / BODY_COST_SHARE),
      totalMax: Math.round(3500 / BODY_COST_SHARE),
    })
  })

  it('坪単価が片方しか無ければその値を両端に使う', () => {
    expect(estimateCost({ pricePerTsuboMin: 90, pricePerTsuboMax: null }, plan)).toEqual({
      bodyMin: 2700,
      bodyMax: 3150,
      totalMin: 3857,
      totalMax: 4500,
    })
    expect(estimateCost({ pricePerTsuboMin: null, pricePerTsuboMax: 90 }, plan)?.bodyMin).toBe(2700)
  })

  it('坪単価が無ければ null', () => {
    expect(estimateCost({ pricePerTsuboMin: null, pricePerTsuboMax: null }, plan)).toBeNull()
  })
})

describe('judgeBudget', () => {
  const estimate = { bodyMin: 2800, bodyMax: 3500, totalMin: 4000, totalMax: 5000 }

  it('上限が予算以下なら within、下限が予算超なら over、間なら tight', () => {
    expect(judgeBudget(estimate, 6000)).toBe('within')
    expect(judgeBudget(estimate, 5000)).toBe('within')
    expect(judgeBudget(estimate, 4500)).toBe('tight')
    expect(judgeBudget(estimate, 3999)).toBe('over')
  })

  it('目安なし・予算なしは null', () => {
    expect(judgeBudget(null, 6000)).toBeNull()
    expect(judgeBudget(estimate, null)).toBeNull()
  })
})

describe('format', () => {
  it('万円・レンジ・坪', () => {
    expect(formatManYen(4200)).toBe('4,200万円')
    expect(formatManYen(12000)).toBe('12,000万円')
    expect(formatManYenRange(3000, 4200)).toBe('3,000〜4,200万円')
    expect(formatManYenRange(3000, 3000)).toBe('3,000万円')
    expect(formatTsuboRange({ tsuboMin: 30, tsuboMax: 35 })).toBe('30〜35坪')
    expect(formatTsuboRange({ tsuboMin: 30, tsuboMax: 30 })).toBe('30坪')
  })
})

describe('presentFacts', () => {
  it('値のあるキーだけを行順で返す。ラベルは対応表から', () => {
    const rows = presentFacts({ facts: { hiraya: '実績あり', founded: '1966 年', scale: '' } })
    expect(rows).toEqual([
      { key: 'founded', label: RESEARCH_FACT_LABEL.founded, value: '1966 年' },
      { key: 'hiraya', label: RESEARCH_FACT_LABEL.hiraya, value: '実績あり' },
    ])
    expect(presentFacts(null)).toEqual([])
  })

  it('全キーにラベルがある', () => {
    for (const key of RESEARCH_FACT_KEYS) expect(RESEARCH_FACT_LABEL[key]).toBeTruthy()
  })
})

describe('emptyResearch', () => {
  it('日付だけ入った空のメモ', () => {
    expect(emptyResearch('2030-01-05')).toEqual({
      version: 1,
      researchedOn: '2030-01-05',
      summary: '',
      facts: {},
      sections: [],
      sources: [],
    })
  })
})
