import { describe, expect, it } from 'vitest'

import {
  addDays,
  compareStartsAt,
  composeStartsAt,
  dateKey,
  formatDateSlash,
  formatDateWithWeekday,
  formatEventBadge,
  formatMonthSlash,
  formatEventTime,
  formatShortDateWithWeekday,
  groupByDay,
  groupByDayKeepOrder,
  monthKeys,
  splitStartsAt,
} from './calendar'

describe('dateKey / composeStartsAt / splitStartsAt', () => {
  it('round-trips all-day as date only and timed with +09:00', () => {
    expect(composeStartsAt('2030-01-05', null)).toBe('2030-01-05')
    expect(composeStartsAt('2030-01-05', '13:00')).toBe('2030-01-05T13:00:00+09:00')
    expect(dateKey('2030-01-05T13:00:00+09:00')).toBe('2030-01-05')
    expect(dateKey('2030-01-05')).toBe('2030-01-05')
    expect(splitStartsAt('2030-01-05T13:00:00+09:00')).toEqual({
      date: '2030-01-05',
      time: '13:00',
    })
    expect(splitStartsAt('2030-01-05')).toEqual({ date: '2030-01-05', time: null })
  })
})

describe('monthKeys', () => {
  it('February of a leap year has 29 days', () => {
    const keys = monthKeys(2028, 2)
    expect(keys).toHaveLength(29)
    expect(keys[0]).toBe('2028-02-01')
    expect(keys[28]).toBe('2028-02-29')
    expect(monthKeys(2030, 12)).toHaveLength(31)
  })
})

describe('groupByDay', () => {
  it('groups by date key, ordered by start within a day', () => {
    const g = groupByDay([
      { id: 'b', startsAt: '2030-01-05T15:00:00+09:00' },
      { id: 'a', startsAt: '2030-01-05T09:30:00+09:00' },
      { id: 'c', startsAt: '2030-01-06' },
      { id: 'd', startsAt: '2030-01-05' },
    ])
    expect([...g.keys()]).toEqual(['2030-01-05', '2030-01-06'])
    expect(g.get('2030-01-05')?.map((e) => e.id)).toEqual(['d', 'a', 'b'])
  })
})

describe('formatEventTime', () => {
  it('all-day / start–end / start only', () => {
    expect(formatEventTime({ startsAt: '2030-01-05', endsAt: null, allDay: true })).toBe('終日')
    expect(
      formatEventTime({
        startsAt: '2030-01-05T13:00:00+09:00',
        endsAt: '2030-01-05T15:30:00+09:00',
        allDay: false,
      }),
    ).toBe('13:00–15:30')
    expect(
      formatEventTime({ startsAt: '2030-01-05T13:00:00+09:00', endsAt: null, allDay: false }),
    ).toBe('13:00')
  })

  it('falls back to an empty string when allDay is false but there is no time part', () => {
    expect(formatEventTime({ startsAt: '2030-01-05', endsAt: null, allDay: false })).toBe('')
  })
})

describe('formatDateSlash', () => {
  it('turns hyphen-separated into slash-separated', () => {
    expect(formatDateSlash('2026-09-20')).toBe('2026/09/20')
  })

  it('returns a string of a different shape as is', () => {
    expect(formatDateSlash('invalid')).toBe('invalid')
    expect(formatDateSlash('2026-9-20')).toBe('2026-9-20')
  })
})

describe('formatDateWithWeekday', () => {
  it('Sunday gets the weekday in full-width parentheses (slash-separated)', () => {
    expect(formatDateWithWeekday('2026-09-20')).toBe('2026/09/20（日）')
  })

  it('Wednesday gets the weekday in full-width parentheses (slash-separated)', () => {
    expect(formatDateWithWeekday('2026-09-16')).toBe('2026/09/16（水）')
  })

  it('returns an unreadable string as is', () => {
    expect(formatDateWithWeekday('invalid')).toBe('invalid')
  })
})

describe('addDays', () => {
  it('adds across months', () => {
    expect(addDays('2026-09-16', 27)).toBe('2026-10-13')
    expect(addDays('2026-09-16', 1)).toBe('2026-09-17')
  })

  it('adds across years', () => {
    expect(addDays('2026-12-20', 27)).toBe('2027-01-16')
  })

  it('goes back days with a negative number', () => {
    expect(addDays('2026-09-16', -1)).toBe('2026-09-15')
  })

  it('crosses February of a leap year', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
  })
})

describe('compareStartsAt', () => {
  it('all-day comes before a timed one on the same day', () => {
    expect(compareStartsAt('2030-01-05', '2030-01-05T09:00:00+09:00')).toBeLessThan(0)
    expect(compareStartsAt('2030-01-06', '2030-01-05T23:00:00+09:00')).toBeGreaterThan(0)
    expect(compareStartsAt('2030-01-05', '2030-01-05')).toBe(0)
  })
})

describe('formatShortDateWithWeekday', () => {
  it('adds the weekday in half-width parentheses to YYYY/MM/DD (Saturday)', () => {
    expect(formatShortDateWithWeekday('2026-09-12')).toBe('2026/09/12(土)')
  })

  it('Sunday uses the same format', () => {
    expect(formatShortDateWithWeekday('2026-09-13')).toBe('2026/09/13(日)')
  })

  it('returns an unreadable string as is', () => {
    expect(formatShortDateWithWeekday('invalid')).toBe('invalid')
  })
})

describe('formatMonthSlash', () => {
  it("'YYYY-MM' to 'YYYY/MM'. Returned as is when the shape differs", () => {
    expect(formatMonthSlash('2026-09')).toBe('2026/09')
    expect(formatMonthSlash('2026-9')).toBe('2026-9')
  })
})

describe('formatEventBadge', () => {
  it('returns null when there is no eventKind', () => {
    expect(formatEventBadge(null, '2026-09-12', '2026-09-12')).toBeNull()
  })

  it('returns null when there is no eventStart', () => {
    expect(formatEventBadge('見学会', null, null)).toBeNull()
  })

  it('uses the single-day notation when there is no eventEnd', () => {
    expect(formatEventBadge('見学会', '2026-09-12', null)).toBe('見学会 2026/09/12(土)')
  })

  it('uses the single-day notation when eventEnd equals eventStart', () => {
    expect(formatEventBadge('見学会', '2026-09-12', '2026-09-12')).toBe('見学会 2026/09/12(土)')
  })

  it('uses the range notation when eventEnd differs', () => {
    expect(formatEventBadge('見学会', '2026-09-12', '2026-09-13')).toBe(
      '見学会 2026/09/12(土)〜2026/09/13(日)',
    )
  })
})

describe('groupByDayKeepOrder', () => {
  it('groups by date key in the given order (no sorting)', () => {
    const groups = groupByDayKeepOrder(
      [
        { id: 'a', publishedOn: '2026-09-13' },
        { id: 'b', publishedOn: '2026-09-13' },
        { id: 'c', publishedOn: '2026-09-10' },
      ],
      (item) => item.publishedOn,
    )
    expect(groups).toEqual([
      {
        day: '2026-09-13',
        items: [
          { id: 'a', publishedOn: '2026-09-13' },
          { id: 'b', publishedOn: '2026-09-13' },
        ],
      },
      { day: '2026-09-10', items: [{ id: 'c', publishedOn: '2026-09-10' }] },
    ])
  })

  it('merges into the same group even when the same date key appears apart', () => {
    const groups = groupByDayKeepOrder(
      [
        { id: 'a', publishedOn: '2026-09-13' },
        { id: 'b', publishedOn: '2026-09-10' },
        { id: 'c', publishedOn: '2026-09-13' },
      ],
      (item) => item.publishedOn,
    )
    expect(groups).toEqual([
      {
        day: '2026-09-13',
        items: [
          { id: 'a', publishedOn: '2026-09-13' },
          { id: 'c', publishedOn: '2026-09-13' },
        ],
      },
      { day: '2026-09-10', items: [{ id: 'b', publishedOn: '2026-09-10' }] },
    ])
  })

  it('returns an empty array for an empty array', () => {
    expect(groupByDayKeepOrder([], (item: { publishedOn: string }) => item.publishedOn)).toEqual([])
  })
})
