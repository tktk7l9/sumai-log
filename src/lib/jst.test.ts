import { describe, expect, it } from 'vitest'

import { formatJst, formatJstTime, parseToUtcMs, toJstDateKey } from './jst'

describe('parseToUtcMs', () => {
  it('converts the D1 space-separated form (no offset = UTC) to UTC milliseconds', () => {
    expect(parseToUtcMs('2030-01-05 23:30:00')).toBe(Date.UTC(2030, 0, 5, 23, 30, 0))
  })

  it('converts ISO with Z to UTC milliseconds', () => {
    expect(parseToUtcMs('2030-01-05T23:30:00Z')).toBe(Date.UTC(2030, 0, 5, 23, 30, 0))
  })

  it('converts ISO with a +09:00 offset to UTC milliseconds (the same instant)', () => {
    expect(parseToUtcMs('2030-01-06T08:30:00+09:00')).toBe(Date.UTC(2030, 0, 5, 23, 30, 0))
  })

  it('also treats ISO with the T separator and no offset as UTC', () => {
    expect(parseToUtcMs('2030-01-05T23:30:00')).toBe(Date.UTC(2030, 0, 5, 23, 30, 0))
  })

  it('returns null for a string that does not match the format', () => {
    expect(parseToUtcMs('not-a-date')).toBeNull()
    expect(parseToUtcMs('')).toBeNull()
  })

  it('returns null for a nonexistent month or day even when the format matches (Date.parse returns NaN)', () => {
    // September 32 does not exist (a case where Date.parse returns NaN without rolling over)
    expect(parseToUtcMs('2026-09-32T09:00:00+09:00')).toBeNull()
    // Month 13 does not exist either
    expect(parseToUtcMs('2026-13-01T09:00:00+09:00')).toBeNull()
  })

  it('converts Z with fractional seconds (the shape of new Date().toISOString()) to UTC milliseconds', () => {
    expect(parseToUtcMs('2030-01-05T17:04:28.333Z')).toBe(Date.UTC(2030, 0, 5, 17, 4, 28, 333))
  })

  it('gives the same instant for a +09:00 offset with fractional seconds too', () => {
    expect(parseToUtcMs('2030-01-06T02:04:28.333+09:00')).toBe(Date.UTC(2030, 0, 5, 17, 4, 28, 333))
  })

  it('also reads the D1 space-separated form (no offset = UTC) with fractional seconds', () => {
    expect(parseToUtcMs('2030-01-05 17:04:28.100')).toBe(Date.UTC(2030, 0, 5, 17, 4, 28, 100))
  })
})

describe('formatJst', () => {
  it('converts the D1 space-separated form (no offset = UTC) to JST (the date is slash-separated)', () => {
    expect(formatJst('2030-01-05 23:30:00')).toBe('2030/01/06 08:30')
  })

  it('gives the same result as D1 for ISO with Z', () => {
    expect(formatJst('2030-01-05T23:30:00Z')).toBe('2030/01/06 08:30')
  })

  it('also reads ISO with a +09:00 offset', () => {
    expect(formatJst('2030-01-06T08:30:00+09:00')).toBe('2030/01/06 08:30')
  })

  it('also treats ISO with the T separator and no offset as UTC', () => {
    expect(formatJst('2030-01-05T23:30:00')).toBe('2030/01/06 08:30')
  })

  it('gives only the date for withTime: false (slash-separated)', () => {
    expect(formatJst('2030-01-05T23:30:00Z', { withTime: false })).toBe('2030/01/06')
  })

  it('gives the same as the default when withTime is explicitly true', () => {
    expect(formatJst('2030-01-05T23:30:00Z', { withTime: true })).toBe('2030/01/06 08:30')
  })

  it('returns a string that cannot be interpreted as is', () => {
    expect(formatJst('not-a-date')).toBe('not-a-date')
    expect(formatJst('')).toBe('')
  })

  it('also returns a nonexistent month or day (parseToUtcMs is null) as is (does not become NaN-NaN-NaN)', () => {
    expect(formatJst('2026-09-32T09:00:00+09:00')).toBe('2026-09-32T09:00:00+09:00')
  })

  it('passes a date-only string without a time (watchedOn etc.) through as is with withTime: false', () => {
    expect(formatJst('2030-01-05', { withTime: false })).toBe('2030-01-05')
  })
})

describe('toJstDateKey', () => {
  it('returns the JST date key', () => {
    expect(toJstDateKey('2030-01-05T23:30:00Z')).toBe('2030-01-06')
  })

  it('returns a string that cannot be interpreted as is', () => {
    expect(toJstDateKey('invalid')).toBe('invalid')
  })

  it('also returns a nonexistent month or day as is', () => {
    expect(toJstDateKey('2026-09-32T09:00:00+09:00')).toBe('2026-09-32T09:00:00+09:00')
  })
})

describe('formatJstTime', () => {
  it('converts the D1 space-separated form (no offset = UTC) to JST HH:mm', () => {
    expect(formatJstTime('2030-01-05 23:30:00')).toBe('08:30')
  })

  it('gives the same result for ISO with Z too', () => {
    expect(formatJstTime('2030-01-05T23:30:00Z')).toBe('08:30')
  })

  it('also reads fractional seconds', () => {
    expect(formatJstTime('2030-01-05T17:04:28.333Z')).toBe('02:04')
  })

  it('returns an empty string for a string that cannot be interpreted', () => {
    expect(formatJstTime('not-a-date')).toBe('')
    expect(formatJstTime('')).toBe('')
  })
})
