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
  it('バイト・KB・MB・GB・TB を 1 桁の小数で', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 ** 2)).toBe('5.0 MB')
    expect(formatBytes(1.25 * 1024 ** 3)).toBe('1.3 GB')
    expect(formatBytes(3 * 1024 ** 4)).toBe('3.0 TB')
    expect(formatBytes(3 * 1024 ** 5)).toBe('3072.0 TB')
  })

  it('負の値や NaN は —', () => {
    expect(formatBytes(-1)).toBe('—')
    expect(formatBytes(Number.NaN)).toBe('—')
  })
})

describe('percentOf', () => {
  it('小数 1 桁の割合。上限 0 や使用量 0 は 0', () => {
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
  it('初回は書く。間隔が空くまで書かない', () => {
    expect(shouldRecordSeen(undefined, 1000)).toBe(true)
    expect(shouldRecordSeen(1000, 1000 + SEEN_INTERVAL_MS - 1)).toBe(false)
    expect(shouldRecordSeen(1000, 1000 + SEEN_INTERVAL_MS)).toBe(true)
    expect(shouldRecordSeen(1000, 1500, 400)).toBe(true)
  })
})

describe('lastSeenKey', () => {
  it('メールを小文字に寄せてキーにし、キーからメールへ戻せる', () => {
    expect(lastSeenKey(' Owner@Example.com ')).toBe('lastSeen:owner@example.com')
    expect(emailFromLastSeenKey('lastSeen:owner@example.com')).toBe('owner@example.com')
    expect(emailFromLastSeenKey('lastSeen:')).toBeNull()
    expect(emailFromLastSeenKey('homeAreas')).toBeNull()
  })
})

describe('formatRowCounts', () => {
  it('0 件は省き、画面の呼び名で並べる', () => {
    expect(formatRowCounts({ visits: 12, photos: 1234, vendors: 0 })).toBe(
      '見学記録 12・写真 1,234',
    )
    expect(formatRowCounts({})).toBe('なし')
  })
})
