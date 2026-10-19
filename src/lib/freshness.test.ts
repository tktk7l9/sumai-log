import { describe, expect, it } from 'vitest'

import { daysUntil, isRecent, upcomingLabel } from './freshness'

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

describe('daysUntil', () => {
  it.each([
    ['2026-10-05', 0],
    ['2026-10-06', 1],
    ['2026-10-05T23:30', 0],
    ['2026-10-04T23:00', -1],
    // Across a month end and a year end
    ['2026-11-01', 27],
    ['2027-01-01', 88],
  ])('%s -> %s', (value, expected) => {
    expect(daysUntil(value, TODAY)).toBe(expected)
  })

  it('counts calendar days, not 24-hour spans, across a leap day', () => {
    expect(daysUntil('2028-03-01', '2028-02-28')).toBe(2)
  })
})

describe('upcomingLabel', () => {
  it.each([
    ['2026-10-05', '今日'],
    ['2026-10-05T18:00', '今日'],
    ['2026-10-06', '明日'],
    ['2026-10-07', '明後日'],
    ['2026-10-08', 'あと3日'],
    ['2026-10-11T18:00', 'あと6日'],
    ['2026-10-12', 'あと7日'],
    ['2026-10-13', null],
    ['2026-10-04T23:00', null],
  ])('%s -> %s', (value, expected) => {
    expect(upcomingLabel(value, TODAY)).toBe(expected)
  })
})
