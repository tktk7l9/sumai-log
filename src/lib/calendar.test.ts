import { describe, expect, it } from 'vitest'

import {
  compareStartsAt,
  composeStartsAt,
  dateKey,
  formatDateWithWeekday,
  formatEventTime,
  groupByDay,
  monthKeys,
  splitStartsAt,
} from './calendar'

describe('dateKey / composeStartsAt / splitStartsAt', () => {
  it('終日は日付だけ、時刻ありは +09:00 付きで往復する', () => {
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
  it('うるう年の 2 月は 29 日', () => {
    const keys = monthKeys(2028, 2)
    expect(keys).toHaveLength(29)
    expect(keys[0]).toBe('2028-02-01')
    expect(keys[28]).toBe('2028-02-29')
    expect(monthKeys(2030, 12)).toHaveLength(31)
  })
})

describe('groupByDay', () => {
  it('日付キーでまとめ、日内は開始順', () => {
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
  it('終日／開始–終了／開始のみ', () => {
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

  it('allDay が false でも時刻部が無ければ空文字にフォールバックする', () => {
    expect(formatEventTime({ startsAt: '2030-01-05', endsAt: null, allDay: false })).toBe('')
  })
})

describe('formatDateWithWeekday', () => {
  it('日曜は（日）が付く', () => {
    expect(formatDateWithWeekday('2026-09-20')).toBe('2026-09-20（日）')
  })

  it('水曜は（水）が付く', () => {
    expect(formatDateWithWeekday('2026-09-16')).toBe('2026-09-16（水）')
  })

  it('読めない文字列はそのまま返す', () => {
    expect(formatDateWithWeekday('invalid')).toBe('invalid')
  })
})

describe('compareStartsAt', () => {
  it('終日は同じ日の時刻ありより前', () => {
    expect(compareStartsAt('2030-01-05', '2030-01-05T09:00:00+09:00')).toBeLessThan(0)
    expect(compareStartsAt('2030-01-06', '2030-01-05T23:00:00+09:00')).toBeGreaterThan(0)
    expect(compareStartsAt('2030-01-05', '2030-01-05')).toBe(0)
  })
})
