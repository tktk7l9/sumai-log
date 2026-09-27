import { describe, expect, it } from 'vitest'

import { PULL_MAX, PULL_THRESHOLD, pullDistance, pullOpacity, shouldRefresh } from './pullToRefresh'

describe('pullDistance', () => {
  it('returns 0 for 0 or less', () => {
    expect(pullDistance(0)).toBe(0)
    expect(pullDistance(-30)).toBe(0)
  })
  it('grows the more you pull but never exceeds the maximum', () => {
    const a = pullDistance(40)
    const b = pullDistance(120)
    const c = pullDistance(2000)
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThanOrEqual(b)
    expect(c).toBeLessThanOrEqual(PULL_MAX)
  })
  it('reaches the threshold with a realistic finger travel', () => {
    expect(shouldRefresh(pullDistance(150))).toBe(true)
    expect(shouldRefresh(pullDistance(40))).toBe(false)
  })
})

describe('shouldRefresh', () => {
  it('refreshes at exactly the threshold', () => {
    expect(shouldRefresh(PULL_THRESHOLD)).toBe(true)
    expect(shouldRefresh(PULL_THRESHOLD - 1)).toBe(false)
  })
})

describe('pullOpacity', () => {
  it('is 0 at 0, 1 at the threshold, and still 1 beyond it', () => {
    expect(pullOpacity(0)).toBe(0)
    expect(pullOpacity(PULL_THRESHOLD / 2)).toBeCloseTo(0.5)
    expect(pullOpacity(PULL_THRESHOLD)).toBe(1)
    expect(pullOpacity(PULL_MAX)).toBe(1)
  })
})
