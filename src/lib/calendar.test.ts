import { describe, expect, it } from 'vitest'

import {
  addDays,
  compareStartsAt,
  composeStartsAt,
  dateKey,
  formatDateSlash,
  formatDateWithWeekday,
  formatEventBadge,
  formatEventTime,
  formatShortDateWithWeekday,
  groupByDay,
  groupByDayKeepOrder,
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

describe('formatDateSlash', () => {
  it('ハイフン区切りをスラッシュ区切りに直す', () => {
    expect(formatDateSlash('2026-09-20')).toBe('2026/09/20')
  })

  it('形が合わない文字列はそのまま返す', () => {
    expect(formatDateSlash('invalid')).toBe('invalid')
    expect(formatDateSlash('2026-9-20')).toBe('2026-9-20')
  })
})

describe('formatDateWithWeekday', () => {
  it('日曜は（日）が付く（スラッシュ区切り）', () => {
    expect(formatDateWithWeekday('2026-09-20')).toBe('2026/09/20（日）')
  })

  it('水曜は（水）が付く（スラッシュ区切り）', () => {
    expect(formatDateWithWeekday('2026-09-16')).toBe('2026/09/16（水）')
  })

  it('読めない文字列はそのまま返す', () => {
    expect(formatDateWithWeekday('invalid')).toBe('invalid')
  })
})

describe('addDays', () => {
  it('月をまたいで加算する', () => {
    expect(addDays('2026-09-16', 27)).toBe('2026-10-13')
    expect(addDays('2026-09-16', 1)).toBe('2026-09-17')
  })

  it('年をまたいで加算する', () => {
    expect(addDays('2026-12-20', 27)).toBe('2027-01-16')
  })

  it('負数で日をさかのぼる', () => {
    expect(addDays('2026-09-16', -1)).toBe('2026-09-15')
  })

  it('うるう年の 2 月をまたぐ', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
  })
})

describe('compareStartsAt', () => {
  it('終日は同じ日の時刻ありより前', () => {
    expect(compareStartsAt('2030-01-05', '2030-01-05T09:00:00+09:00')).toBeLessThan(0)
    expect(compareStartsAt('2030-01-06', '2030-01-05T23:00:00+09:00')).toBeGreaterThan(0)
    expect(compareStartsAt('2030-01-05', '2030-01-05')).toBe(0)
  })
})

describe('formatShortDateWithWeekday', () => {
  it('月日をゼロ埋めせず半角括弧で曜日を付ける（土）', () => {
    expect(formatShortDateWithWeekday('2026-09-12')).toBe('9/12(土)')
  })

  it('日曜も同じ形式（日）', () => {
    expect(formatShortDateWithWeekday('2026-09-13')).toBe('9/13(日)')
  })

  it('読めない文字列はそのまま返す', () => {
    expect(formatShortDateWithWeekday('invalid')).toBe('invalid')
  })
})

describe('formatEventBadge', () => {
  it('eventKind が無ければ null', () => {
    expect(formatEventBadge(null, '2026-09-12', '2026-09-12')).toBeNull()
  })

  it('eventStart が無ければ null', () => {
    expect(formatEventBadge('見学会', null, null)).toBeNull()
  })

  it('eventEnd が無ければ単日表記', () => {
    expect(formatEventBadge('見学会', '2026-09-12', null)).toBe('見学会 9/12(土)')
  })

  it('eventEnd が eventStart と同じなら単日表記', () => {
    expect(formatEventBadge('見学会', '2026-09-12', '2026-09-12')).toBe('見学会 9/12(土)')
  })

  it('eventEnd が違えば範囲表記', () => {
    expect(formatEventBadge('見学会', '2026-09-12', '2026-09-13')).toBe('見学会 9/12(土)〜9/13(日)')
  })
})

describe('groupByDayKeepOrder', () => {
  it('渡した順のまま日付キーでまとめる（並べ替えない）', () => {
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

  it('同じ日付キーが離れて出てきても同じグループに合流する', () => {
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

  it('空配列は空配列', () => {
    expect(groupByDayKeepOrder([], (item: { publishedOn: string }) => item.publishedOn)).toEqual([])
  })
})
