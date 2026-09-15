import { describe, expect, it } from 'vitest'

import { formatJst, parseToUtcMs, toJstDateKey } from './jst'

describe('parseToUtcMs', () => {
  it('D1 の空白区切り（オフセット無し=UTC）を UTC ミリ秒に直す', () => {
    expect(parseToUtcMs('2030-01-05 23:30:00')).toBe(Date.UTC(2030, 0, 5, 23, 30, 0))
  })

  it('ISO の Z 付きを UTC ミリ秒に直す', () => {
    expect(parseToUtcMs('2030-01-05T23:30:00Z')).toBe(Date.UTC(2030, 0, 5, 23, 30, 0))
  })

  it('ISO の +09:00 オフセット付きを UTC ミリ秒に直す（同じ瞬間になる）', () => {
    expect(parseToUtcMs('2030-01-06T08:30:00+09:00')).toBe(Date.UTC(2030, 0, 5, 23, 30, 0))
  })

  it('ISO の T 区切り・オフセット無しも UTC とみなす', () => {
    expect(parseToUtcMs('2030-01-05T23:30:00')).toBe(Date.UTC(2030, 0, 5, 23, 30, 0))
  })

  it('形式が合わない文字列は null', () => {
    expect(parseToUtcMs('not-a-date')).toBeNull()
    expect(parseToUtcMs('')).toBeNull()
  })

  it('秒の小数部（new Date().toISOString() の形）付き Z を UTC ミリ秒に直す', () => {
    expect(parseToUtcMs('2030-01-05T17:04:28.333Z')).toBe(Date.UTC(2030, 0, 5, 17, 4, 28, 333))
  })

  it('秒の小数部付き +09:00 オフセットも同じ瞬間になる', () => {
    expect(parseToUtcMs('2030-01-06T02:04:28.333+09:00')).toBe(Date.UTC(2030, 0, 5, 17, 4, 28, 333))
  })

  it('秒の小数部付き・D1 の空白区切り（オフセット無し=UTC）も読む', () => {
    expect(parseToUtcMs('2030-01-05 17:04:28.100')).toBe(Date.UTC(2030, 0, 5, 17, 4, 28, 100))
  })
})

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

  it('時刻の無い日付だけの文字列（watchedOn 等）は withTime: false ならそのまま通る', () => {
    expect(formatJst('2030-01-05', { withTime: false })).toBe('2030-01-05')
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
