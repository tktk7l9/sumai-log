import { describe, expect, it } from 'vitest'

import { parseDateInput } from './dates'

describe('parseDateInput', () => {
  it('passes the stored form through unchanged', () => {
    expect(parseDateInput('2026-07-30')).toBe('2026-07-30')
  })

  it('reads values without zero padding', () => {
    expect(parseDateInput('2026-7-3')).toBe('2026-07-03')
  })

  it('reads slash and dot separators', () => {
    expect(parseDateInput('2026/07/30')).toBe('2026-07-30')
    expect(parseDateInput('2026/7/30')).toBe('2026-07-30')
    expect(parseDateInput('2026.7.30')).toBe('2026-07-30')
  })

  it('reads 8 digits without separators', () => {
    expect(parseDateInput('20260730')).toBe('2026-07-30')
  })

  it('reads Japanese notation', () => {
    expect(parseDateInput('2026年7月30日')).toBe('2026-07-30')
    expect(parseDateInput('2026年07月30日')).toBe('2026-07-30')
    // Also accepts a half-typed value without the trailing "日" (day)
    expect(parseDateInput('2026年7月30')).toBe('2026-07-30')
  })

  it('strips leading and trailing whitespace', () => {
    expect(parseDateInput('  2026-07-30  ')).toBe('2026-07-30')
  })

  it('rejects dates that do not exist', () => {
    expect(parseDateInput('2026-02-30')).toBeNull()
    expect(parseDateInput('2026-13-01')).toBeNull()
    expect(parseDateInput('2026-00-10')).toBeNull()
    expect(parseDateInput('2026-07-00')).toBeNull()
    expect(parseDateInput('20260231')).toBeNull()
  })

  it('decides leap years per year', () => {
    expect(parseDateInput('2024-02-29')).toBe('2024-02-29')
    expect(parseDateInput('2026-02-29')).toBeNull()
    // A year divisible by 100 but not by 400 is a common year
    expect(parseDateInput('2100-02-29')).toBeNull()
    expect(parseDateInput('2000-02-29')).toBe('2000-02-29')
  })

  it('rejects values without a year (does not assume this year)', () => {
    expect(parseDateInput('7/30')).toBeNull()
    expect(parseDateInput('07-30')).toBeNull()
  })

  it('returns null for anything unreadable', () => {
    expect(parseDateInput('令和8年7月30日')).toBeNull()
    expect(parseDateInput('来週')).toBeNull()
    expect(parseDateInput('2026-07-30 10:00')).toBeNull()
    expect(parseDateInput('')).toBeNull()
    expect(parseDateInput('   ')).toBeNull()
    expect(parseDateInput(null)).toBeNull()
    expect(parseDateInput(undefined)).toBeNull()
  })
})
