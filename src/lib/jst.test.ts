import { describe, expect, it } from 'vitest'

import { formatJst, toJstDateKey } from './jst'

describe('formatJst', () => {
  it('D1 の空白区切り（オフセット無し=UTC）を JST に直す', () => {
    expect(formatJst('2030-01-05 23:30:00')).toBe('2030-01-06 08:30')
  })

  it('ISO の Z 付きは D1 と同じ結果になる', () => {
    expect(formatJst('2030-01-05T23:30:00Z')).toBe('2030-01-06 08:30')
  })

  it('ISO の +09:00 オフセット付きも読む', () => {
    expect(formatJst('2030-01-06T08:30:00+09:00')).toBe('2030-01-06 08:30')
  })

  it('ISO の T 区切り・オフセット無しも UTC とみなす', () => {
    expect(formatJst('2030-01-05T23:30:00')).toBe('2030-01-06 08:30')
  })

  it('withTime: false は日付だけ', () => {
    expect(formatJst('2030-01-05T23:30:00Z', { withTime: false })).toBe('2030-01-06')
  })

  it('withTime を明示的に true にしても既定と同じ', () => {
    expect(formatJst('2030-01-05T23:30:00Z', { withTime: true })).toBe('2030-01-06 08:30')
  })

  it('解釈できない文字列はそのまま返す', () => {
    expect(formatJst('not-a-date')).toBe('not-a-date')
    expect(formatJst('')).toBe('')
  })
})

describe('toJstDateKey', () => {
  it('JST の日付キーを返す', () => {
    expect(toJstDateKey('2030-01-05T23:30:00Z')).toBe('2030-01-06')
  })

  it('解釈できない文字列はそのまま返す', () => {
    expect(toJstDateKey('invalid')).toBe('invalid')
  })
})
