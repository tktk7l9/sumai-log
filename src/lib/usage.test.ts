import { describe, expect, it } from 'vitest'

import {
  D1_FREE_BYTES,
  R2_FREE_BYTES,
  SEEN_INTERVAL_MS,
  emailFromLastSeenKey,
  formatBytes,
  formatRowCounts,
  lastSeenKey,
  percentOf,
  shouldRecordSeen,
} from './usage'

describe('formatBytes', () => {
  it('formats bytes, KB, MB, GB and TB with 1 decimal place', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 ** 2)).toBe('5.0 MB')
    expect(formatBytes(1.25 * 1024 ** 3)).toBe('1.3 GB')
    expect(formatBytes(3 * 1024 ** 4)).toBe('3.0 TB')
    expect(formatBytes(3 * 1024 ** 5)).toBe('3072.0 TB')
  })

  it('returns — for negative values and NaN', () => {
    expect(formatBytes(-1)).toBe('—')
    expect(formatBytes(Number.NaN)).toBe('—')
  })
})

describe('percentOf', () => {
  it('returns a percentage with 1 decimal place. 0 for a limit of 0 or a usage of 0', () => {
    expect(percentOf(1024 ** 3, D1_FREE_BYTES)).toBe(20)
    expect(percentOf(1024 ** 3, R2_FREE_BYTES)).toBe(10)
    expect(percentOf(123456, 1024 ** 3)).toBe(0)
    expect(percentOf(1234567, 1024 ** 3)).toBe(0.1)
    expect(percentOf(0, 100)).toBe(0)
    expect(percentOf(50, 0)).toBe(0)
    expect(percentOf(Number.NaN, 100)).toBe(0)
  })
})

describe('shouldRecordSeen', () => {
  it('writes the first time. Does not write until the interval has passed', () => {
    expect(shouldRecordSeen(undefined, 1000)).toBe(true)
    expect(shouldRecordSeen(1000, 1000 + SEEN_INTERVAL_MS - 1)).toBe(false)
    expect(shouldRecordSeen(1000, 1000 + SEEN_INTERVAL_MS)).toBe(true)
    expect(shouldRecordSeen(1000, 1500, 400)).toBe(true)
  })
})

describe('lastSeenKey', () => {
  it('lowercases the email into a key, and can get the email back from the key', () => {
    expect(lastSeenKey(' Owner@Example.com ')).toBe('lastSeen:owner@example.com')
    expect(emailFromLastSeenKey('lastSeen:owner@example.com')).toBe('owner@example.com')
    expect(emailFromLastSeenKey('lastSeen:')).toBeNull()
    expect(emailFromLastSeenKey('homeAreas')).toBeNull()
  })
})

describe('formatRowCounts', () => {
  it('omits 0 counts and lists by the names shown on screen', () => {
    expect(formatRowCounts({ visits: 12, photos: 1234, vendors: 0 })).toBe(
      '見学記録 12・写真 1,234',
    )
    expect(formatRowCounts({})).toBe('なし')
  })
})
