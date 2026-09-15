import { describe, expect, it } from 'vitest'

import { formatSqm, formatTsubo, formatYen } from './format'

describe('formatYen', () => {
  it('万円単位に丸め、1万円未満は円、null は「—」', () => {
    expect(formatYen(52_800_000)).toBe('5,280万円')
    expect(formatYen(123_456_789)).toBe('12,346万円')
    expect(formatYen(9_999)).toBe('9,999円')
    expect(formatYen(null)).toBe('—')
  })
})
describe('formatSqm', () => {
  it('小数 2 桁と ㎡', () => {
    expect(formatSqm(70.5)).toBe('70.50㎡')
    expect(formatSqm(null)).toBe('—')
  })
})
describe('formatTsubo', () => {
  it('範囲・片側・無し', () => {
    expect(formatTsubo(80, 100)).toBe('80〜100万円/坪')
    expect(formatTsubo(80, null)).toBe('80万円/坪〜')
    expect(formatTsubo(null, 100)).toBe('〜100万円/坪')
    expect(formatTsubo(null, null)).toBe('—')
  })
})
