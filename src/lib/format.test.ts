import { describe, expect, it } from 'vitest'

import { formatSqm, formatTsubo, formatYen } from './format'

describe('formatYen', () => {
  it('rounds to units of 10,000 yen, uses yen below 10,000 yen, and "—" for null', () => {
    expect(formatYen(52_800_000)).toBe('5,280万円')
    expect(formatYen(123_456_789)).toBe('12,346万円')
    expect(formatYen(9_999)).toBe('9,999円')
    expect(formatYen(null)).toBe('—')
  })
})
describe('formatSqm', () => {
  it('2 decimal places and ㎡', () => {
    expect(formatSqm(70.5)).toBe('70.50㎡')
    expect(formatSqm(null)).toBe('—')
  })
})
describe('formatTsubo', () => {
  it('range, one side, none', () => {
    expect(formatTsubo(80, 100)).toBe('80〜100万円/坪')
    expect(formatTsubo(80, null)).toBe('80万円/坪〜')
    expect(formatTsubo(null, 100)).toBe('〜100万円/坪')
    expect(formatTsubo(null, null)).toBe('—')
  })
})
