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
  parseHiddenIds,
  presentFacts,
  serializeHiddenIds,
} from './research'

describe('parseBuildPlan', () => {
  it('reads valid JSON', () => {
    expect(
      parseBuildPlan(JSON.stringify({ floors: 1, tsuboMin: 30, tsuboMax: 35, budgetManYen: 6000 })),
    ).toEqual({ floors: 1, tsuboMin: 30, tsuboMax: 35, budgetManYen: 6000 })
    expect(
      parseBuildPlan(JSON.stringify({ floors: 2, tsuboMin: 30, tsuboMax: 30, budgetManYen: null })),
    ).toEqual({ floors: 2, tsuboMin: 30, tsuboMax: 30, budgetManYen: null })
  })

  it('returns null for empty input, broken JSON and values of the wrong shape', () => {
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

  it('ranges from min price per tsubo x min tsubo to max x max. The total is body / 0.7', () => {
    const result = estimateCost({ pricePerTsuboMin: 80, pricePerTsuboMax: 100 }, plan)
    expect(result).toEqual({
      bodyMin: 2400,
      bodyMax: 3500,
      totalMin: Math.round(2400 / BODY_COST_SHARE),
      totalMax: Math.round(3500 / BODY_COST_SHARE),
    })
  })

  it('uses the one value for both ends when only one price per tsubo is given', () => {
    expect(estimateCost({ pricePerTsuboMin: 90, pricePerTsuboMax: null }, plan)).toEqual({
      bodyMin: 2700,
      bodyMax: 3150,
      totalMin: 3857,
      totalMax: 4500,
    })
    expect(estimateCost({ pricePerTsuboMin: null, pricePerTsuboMax: 90 }, plan)?.bodyMin).toBe(2700)
  })

  it('returns null without a price per tsubo', () => {
    expect(estimateCost({ pricePerTsuboMin: null, pricePerTsuboMax: null }, plan)).toBeNull()
  })
})

describe('judgeBudget', () => {
  const estimate = { bodyMin: 2800, bodyMax: 3500, totalMin: 4000, totalMax: 5000 }

  it('is within when the max is at or below the budget, over when the min exceeds it, tight in between', () => {
    expect(judgeBudget(estimate, 6000)).toBe('within')
    expect(judgeBudget(estimate, 5000)).toBe('within')
    expect(judgeBudget(estimate, 4500)).toBe('tight')
    expect(judgeBudget(estimate, 3999)).toBe('over')
  })

  it('returns null without an estimate or without a budget', () => {
    expect(judgeBudget(null, 6000)).toBeNull()
    expect(judgeBudget(estimate, null)).toBeNull()
  })
})

describe('format', () => {
  it('formats man-yen, ranges and tsubo', () => {
    expect(formatManYen(4200)).toBe('4,200万円')
    expect(formatManYen(12000)).toBe('12,000万円')
    expect(formatManYenRange(3000, 4200)).toBe('3,000〜4,200万円')
    expect(formatManYenRange(3000, 3000)).toBe('3,000万円')
    expect(formatTsuboRange({ tsuboMin: 30, tsuboMax: 35 })).toBe('30〜35坪')
    expect(formatTsuboRange({ tsuboMin: 30, tsuboMax: 30 })).toBe('30坪')
  })
})

describe('presentFacts', () => {
  it('returns only keys with a value, in row order. Labels come from the lookup table', () => {
    const rows = presentFacts({ facts: { hiraya: '実績あり', founded: '1966 年', scale: '' } })
    expect(rows).toEqual([
      { key: 'founded', label: RESEARCH_FACT_LABEL.founded, value: '1966 年' },
      { key: 'hiraya', label: RESEARCH_FACT_LABEL.hiraya, value: '実績あり' },
    ])
    expect(presentFacts(null)).toEqual([])
  })

  it('has a label for every key', () => {
    for (const key of RESEARCH_FACT_KEYS) expect(RESEARCH_FACT_LABEL[key]).toBeTruthy()
  })
})

describe('emptyResearch', () => {
  it('is an empty memo with only the date filled in', () => {
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

describe('parseHiddenIds / serializeHiddenIds', () => {
  const a = '11111111-1111-4111-8111-111111111111'
  const b = '22222222-2222-4222-8222-222222222222'

  it('reads comma-separated UUIDs and drops whitespace, duplicates and non-UUIDs', () => {
    expect(parseHiddenIds(`${a}, ${b},${a},not-a-uuid,`)).toEqual([a, b])
    expect(parseHiddenIds('')).toEqual([])
    expect(parseHiddenIds(null)).toEqual([])
    expect(parseHiddenIds(undefined)).toEqual([])
  })

  it('round-trips. Returns undefined when empty', () => {
    expect(serializeHiddenIds([a, b])).toBe(`${a},${b}`)
    expect(parseHiddenIds(serializeHiddenIds([a, b]))).toEqual([a, b])
    expect(serializeHiddenIds([])).toBeUndefined()
  })
})
