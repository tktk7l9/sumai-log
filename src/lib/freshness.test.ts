import { describe, expect, it } from 'vitest'

import { isRecent, isWithinWeek } from './freshness'

const TODAY = '2026-10-05'

describe('isRecent', () => {
  it.each([
    ['2026-10-05', true],
    ['2026-09-29', true],
    ['2026-09-28', false],
    ['2026-10-06', false],
    // 2026-09-28 15:30 UTC is 2026-09-29 00:30 in JST
    ['2026-09-28T15:30:00.000Z', true],
    ['2026-09-28T14:59:00.000Z', false],
  ])('%s -> %s', (value, expected) => {
    expect(isRecent(value, TODAY)).toBe(expected)
  })

  it('is false without a date', () => {
    expect(isRecent(null, TODAY)).toBe(false)
  })
})

describe('isWithinWeek', () => {
  it.each([
    ['2026-10-05', true],
    ['2026-10-11T18:00', true],
    ['2026-10-12', false],
    ['2026-10-04T23:00', false],
  ])('%s -> %s', (value, expected) => {
    expect(isWithinWeek(value, TODAY)).toBe(expected)
  })
})
