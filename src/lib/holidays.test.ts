import { describe, expect, it } from 'vitest'

import {
  dayOfWeek,
  equinoxDay,
  holidayName,
  holidaysOfYear,
  isBusinessDay,
  isHoliday,
  isWeekend,
  lastDayOfMonth,
  nextBusinessDay,
  nonBusinessDayReason,
  nthMondayOf,
  resolveObservedDueDate,
} from './holidays'

describe('dayOfWeek', () => {
  it('returns the day of the week (0=Sunday)', () => {
    expect(dayOfWeek('2026-05-31')).toBe(0) // Sunday
    expect(dayOfWeek('2026-06-01')).toBe(1) // Monday
    expect(dayOfWeek('2026-07-31')).toBe(5) // Friday
  })

  it('returns null for an invalid date', () => {
    expect(dayOfWeek('だめ')).toBeNull()
  })

  it('returns null for a month or day that does not exist even when the shape is right', () => {
    expect(dayOfWeek('2026-00-10')).toBeNull() // month is 0
    expect(dayOfWeek('2026-13-01')).toBeNull() // month is 13
    expect(dayOfWeek('2026-01-00')).toBeNull() // day is 0
    expect(dayOfWeek('2026-01-32')).toBeNull() // day is 32
  })
})

describe('isWeekend', () => {
  it('detects Saturday and Sunday', () => {
    expect(isWeekend('2026-05-30')).toBe(true) // Sat
    expect(isWeekend('2026-05-31')).toBe(true) // Sun
    expect(isWeekend('2026-06-01')).toBe(false) // Mon
  })

  it('returns false for an invalid date (does not make a nonexistent day a day off)', () => {
    expect(isWeekend('だめ')).toBe(false)
  })
})

describe('nthMondayOf', () => {
  it('Coming of Age Day (2nd Monday of January)', () => {
    expect(nthMondayOf(2026, 1, 2)).toBe(12)
    expect(nthMondayOf(2025, 1, 2)).toBe(13)
  })

  it('Marine Day (3rd Monday of July)', () => {
    expect(nthMondayOf(2026, 7, 3)).toBe(20)
  })

  it('gives the 1st as the 1st Monday when the month starts on a Monday too', () => {
    // 2026-06-01 is a Monday
    expect(nthMondayOf(2026, 6, 1)).toBe(1)
  })

  it('gives the 2nd as the 1st Monday when the month starts on a Sunday', () => {
    // 2026-11-01 is a Sunday
    expect(nthMondayOf(2026, 11, 1)).toBe(2)
  })
})

describe('equinoxDay', () => {
  it('matches the vernal and autumnal equinoxes in the official gazette', () => {
    expect(equinoxDay(2024, 'spring')).toBe(20)
    expect(equinoxDay(2024, 'autumn')).toBe(22)
    expect(equinoxDay(2025, 'spring')).toBe(20)
    expect(equinoxDay(2025, 'autumn')).toBe(23)
    expect(equinoxDay(2026, 'spring')).toBe(20)
    expect(equinoxDay(2026, 'autumn')).toBe(23)
  })
})

describe('holidaysOfYear (2026)', () => {
  const holidays = holidaysOfYear(2026)

  it.each([
    ['2026-01-01', '元日'],
    ['2026-01-12', '成人の日'],
    ['2026-02-11', '建国記念の日'],
    ['2026-02-23', '天皇誕生日'],
    ['2026-03-20', '春分の日'],
    ['2026-04-29', '昭和の日'],
    ['2026-05-03', '憲法記念日'],
    ['2026-05-04', 'みどりの日'],
    ['2026-05-05', 'こどもの日'],
    ['2026-07-20', '海の日'],
    ['2026-08-11', '山の日'],
    ['2026-09-21', '敬老の日'],
    ['2026-09-23', '秋分の日'],
    ['2026-10-12', 'スポーツの日'],
    ['2026-11-03', '文化の日'],
    ['2026-11-23', '勤労感謝の日'],
  ])('%s is %s', (iso, name) => {
    expect(holidays.get(iso)).toBe(name)
  })

  it('puts the substitute holiday on May 6 because Constitution Memorial Day is a Sunday (5/4 and 5/5 are taken by holidays)', () => {
    expect(holidays.get('2026-05-06')).toBe('振替休日')
  })

  it('makes September 22, between Respect for the Aged Day and Autumnal Equinox Day, a citizens holiday', () => {
    expect(holidays.get('2026-09-22')).toBe('国民の休日')
  })

  it('does not contain days that are not holidays', () => {
    expect(holidays.has('2026-05-31')).toBe(false)
    expect(holidays.has('2026-07-31')).toBe(false)
  })
})

describe('holidayName / isHoliday', () => {
  it('returns the holiday name', () => {
    expect(holidayName('2026-01-01')).toBe('元日')
    expect(isHoliday('2026-01-01')).toBe(true)
  })

  it('returns null / false for a weekday', () => {
    expect(holidayName('2026-07-31')).toBeNull()
    expect(isHoliday('2026-07-31')).toBe(false)
  })

  it('returns null / false for an invalid date', () => {
    expect(holidayName('だめ')).toBeNull()
    expect(isHoliday('だめ')).toBe(false)
  })
})

describe('isBusinessDay', () => {
  it('treats a weekday as a business day', () => {
    expect(isBusinessDay('2026-07-31')).toBe(true)
  })

  it('does not treat weekends and holidays as business days', () => {
    expect(isBusinessDay('2026-05-31')).toBe(false) // Sunday
    expect(isBusinessDay('2026-05-30')).toBe(false) // Saturday
    expect(isBusinessDay('2026-01-01')).toBe(false) // New Year's Day
  })

  it('does not treat an invalid date as a business day', () => {
    expect(isBusinessDay('だめ')).toBe(false)
  })
})

describe('nextBusinessDay', () => {
  /**
   * Checked against the fiscal year Reiwa 8 due dates for fixed asset tax and city planning
   * tax published by Test City. The statutory due dates are the last day of May, July,
   * September and November, or the next business day when that is a day off.
   * Source: Test City website "市税などの納期限（令和8年度）" (Due dates for city taxes etc.,
   * fiscal year Reiwa 8)
   */
  it('1st instalment: May 31 is a Sunday, so June 1 (matches the published value)', () => {
    expect(nextBusinessDay('2026-05-31')).toBe('2026-06-01')
  })

  it('2nd instalment: July 31 is a Friday, so unchanged (matches the published value)', () => {
    expect(nextBusinessDay('2026-07-31')).toBe('2026-07-31')
  })

  it('3rd instalment: September 30 is a Wednesday, so unchanged (matches the published value)', () => {
    expect(nextBusinessDay('2026-09-30')).toBe('2026-09-30')
  })

  it('4th instalment: November 30 is a Monday, so unchanged (matches the published value)', () => {
    expect(nextBusinessDay('2026-11-30')).toBe('2026-11-30')
  })

  it('moves a Saturday to Monday', () => {
    expect(nextBusinessDay('2026-05-30')).toBe('2026-06-01')
  })

  it('moves across consecutive holidays (from the Sunday of Constitution Memorial Day, taken up to the substitute holiday)', () => {
    expect(nextBusinessDay('2026-05-03')).toBe('2026-05-07')
  })

  it('crosses the year-end and New Year period', () => {
    // 2026-12-31 is a Thursday. The next day 1/1 is New Year's Day, 1/2 and 1/3 are Sat and Sun
    expect(nextBusinessDay('2027-01-01')).toBe('2027-01-04')
  })

  it('returns an invalid date as is', () => {
    expect(nextBusinessDay('だめ')).toBe('だめ')
  })
})

describe('nonBusinessDayReason', () => {
  it('returns the name for a holiday', () => {
    expect(nonBusinessDayReason('2026-01-01')).toBe('元日')
  })

  it('returns the day of the week for Saturday and Sunday', () => {
    expect(nonBusinessDayReason('2026-05-31')).toBe('日曜')
    expect(nonBusinessDayReason('2026-05-30')).toBe('土曜')
  })

  it('returns null for a business day and an invalid date', () => {
    expect(nonBusinessDayReason('2026-07-31')).toBeNull()
    expect(nonBusinessDayReason('だめ')).toBeNull()
  })
})

describe('lastDayOfMonth', () => {
  it('February of a leap year', () => {
    expect(lastDayOfMonth(2024, 2)).toBe(29)
    expect(lastDayOfMonth(2026, 2)).toBe(28)
  })

  it('treats a century year divisible by 100 as a common year even when divisible by 4 (1900)', () => {
    expect(lastDayOfMonth(1900, 2)).toBe(28)
  })

  it('treats a century year divisible by 400 as a leap year (2000)', () => {
    expect(lastDayOfMonth(2000, 2)).toBe(29)
  })
})

describe('resolveObservedDueDate', () => {
  it('leaves the date as is when holiday adjustment is not used', () => {
    expect(resolveObservedDueDate('2026-05-31', false)).toEqual({
      observedOn: '2026-05-31',
      reason: null,
    })
  })

  it('leaves a business day as is and attaches no reason', () => {
    expect(resolveObservedDueDate('2026-07-31', true)).toEqual({
      observedOn: '2026-07-31',
      reason: null,
    })
  })

  it('moves a Sunday to the next business day and attaches a reason', () => {
    expect(resolveObservedDueDate('2026-05-31', true)).toEqual({
      observedOn: '2026-06-01',
      reason: '日曜',
    })
  })

  it('uses the holiday name as the reason for a holiday', () => {
    expect(resolveObservedDueDate('2026-01-01', true)).toEqual({
      observedOn: '2026-01-02',
      reason: '元日',
    })
  })
})
