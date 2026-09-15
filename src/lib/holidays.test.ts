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
  it('曜日を返す（0=日曜）', () => {
    expect(dayOfWeek('2026-05-31')).toBe(0) // 日曜
    expect(dayOfWeek('2026-06-01')).toBe(1) // 月曜
    expect(dayOfWeek('2026-07-31')).toBe(5) // 金曜
  })

  it('不正な日付は null', () => {
    expect(dayOfWeek('だめ')).toBeNull()
  })

  it('形は正しくても存在しない月日は null', () => {
    expect(dayOfWeek('2026-00-10')).toBeNull() // 月が0
    expect(dayOfWeek('2026-13-01')).toBeNull() // 月が13
    expect(dayOfWeek('2026-01-00')).toBeNull() // 日が0
    expect(dayOfWeek('2026-01-32')).toBeNull() // 日が32
  })
})

describe('isWeekend', () => {
  it('土日を判定する', () => {
    expect(isWeekend('2026-05-30')).toBe(true) // 土
    expect(isWeekend('2026-05-31')).toBe(true) // 日
    expect(isWeekend('2026-06-01')).toBe(false) // 月
  })

  it('不正な日付は false（存在しない日を休みにしない）', () => {
    expect(isWeekend('だめ')).toBe(false)
  })
})

describe('nthMondayOf', () => {
  it('成人の日（1月第2月曜）', () => {
    expect(nthMondayOf(2026, 1, 2)).toBe(12)
    expect(nthMondayOf(2025, 1, 2)).toBe(13)
  })

  it('海の日（7月第3月曜）', () => {
    expect(nthMondayOf(2026, 7, 3)).toBe(20)
  })

  it('月初が月曜のときも第1月曜は1日', () => {
    // 2026-06-01 は月曜
    expect(nthMondayOf(2026, 6, 1)).toBe(1)
  })

  it('月初が日曜のときの第1月曜は2日', () => {
    // 2026-11-01 は日曜
    expect(nthMondayOf(2026, 11, 1)).toBe(2)
  })
})

describe('equinoxDay', () => {
  it('官報の春分・秋分と一致する', () => {
    expect(equinoxDay(2024, 'spring')).toBe(20)
    expect(equinoxDay(2024, 'autumn')).toBe(22)
    expect(equinoxDay(2025, 'spring')).toBe(20)
    expect(equinoxDay(2025, 'autumn')).toBe(23)
    expect(equinoxDay(2026, 'spring')).toBe(20)
    expect(equinoxDay(2026, 'autumn')).toBe(23)
  })
})

describe('holidaysOfYear（2026年）', () => {
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
  ])('%s は %s', (iso, name) => {
    expect(holidays.get(iso)).toBe(name)
  })

  it('憲法記念日が日曜なので振替休日は5月6日（5/4・5/5 は祝日で埋まっている）', () => {
    expect(holidays.get('2026-05-06')).toBe('振替休日')
  })

  it('敬老の日と秋分の日に挟まれた9月22日は国民の休日', () => {
    expect(holidays.get('2026-09-22')).toBe('国民の休日')
  })

  it('祝日でない日は入っていない', () => {
    expect(holidays.has('2026-05-31')).toBe(false)
    expect(holidays.has('2026-07-31')).toBe(false)
  })
})

describe('holidayName / isHoliday', () => {
  it('祝日の名称を返す', () => {
    expect(holidayName('2026-01-01')).toBe('元日')
    expect(isHoliday('2026-01-01')).toBe(true)
  })

  it('平日は null / false', () => {
    expect(holidayName('2026-07-31')).toBeNull()
    expect(isHoliday('2026-07-31')).toBe(false)
  })

  it('不正な日付は null / false', () => {
    expect(holidayName('だめ')).toBeNull()
    expect(isHoliday('だめ')).toBe(false)
  })
})

describe('isBusinessDay', () => {
  it('平日は開庁日', () => {
    expect(isBusinessDay('2026-07-31')).toBe(true)
  })

  it('土日と祝日は開庁日でない', () => {
    expect(isBusinessDay('2026-05-31')).toBe(false) // 日曜
    expect(isBusinessDay('2026-05-30')).toBe(false) // 土曜
    expect(isBusinessDay('2026-01-01')).toBe(false) // 元日
  })

  it('不正な日付は開庁日でない', () => {
    expect(isBusinessDay('だめ')).toBe(false)
  })
})

describe('nextBusinessDay', () => {
  /**
   * 座間市が公表している令和8年度の固都税の納期限と突き合わせる。
   * 制度上の納期限は5月・7月・9月・11月の末日で、休日なら翌開庁日。
   * 出典: 座間市ホームページ「市税などの納期限（令和8年度）」
   */
  it('第1期 5月31日は日曜なので6月1日（公表値と一致）', () => {
    expect(nextBusinessDay('2026-05-31')).toBe('2026-06-01')
  })

  it('第2期 7月31日は金曜なのでそのまま（公表値と一致）', () => {
    expect(nextBusinessDay('2026-07-31')).toBe('2026-07-31')
  })

  it('第3期 9月30日は水曜なのでそのまま（公表値と一致）', () => {
    expect(nextBusinessDay('2026-09-30')).toBe('2026-09-30')
  })

  it('第4期 11月30日は月曜なのでそのまま（公表値と一致）', () => {
    expect(nextBusinessDay('2026-11-30')).toBe('2026-11-30')
  })

  it('土曜は月曜まで送る', () => {
    expect(nextBusinessDay('2026-05-30')).toBe('2026-06-01')
  })

  it('連休をまたいで送る（憲法記念日の日曜→振替休日まで埋まっている）', () => {
    expect(nextBusinessDay('2026-05-03')).toBe('2026-05-07')
  })

  it('年末年始をまたぐ', () => {
    // 2026-12-31 は木曜。翌1/1 は元日、1/2・1/3 は土日
    expect(nextBusinessDay('2027-01-01')).toBe('2027-01-04')
  })

  it('不正な日付はそのまま返す', () => {
    expect(nextBusinessDay('だめ')).toBe('だめ')
  })
})

describe('nonBusinessDayReason', () => {
  it('祝日は名称を返す', () => {
    expect(nonBusinessDayReason('2026-01-01')).toBe('元日')
  })

  it('土日は曜日を返す', () => {
    expect(nonBusinessDayReason('2026-05-31')).toBe('日曜')
    expect(nonBusinessDayReason('2026-05-30')).toBe('土曜')
  })

  it('開庁日と不正な日付は null', () => {
    expect(nonBusinessDayReason('2026-07-31')).toBeNull()
    expect(nonBusinessDayReason('だめ')).toBeNull()
  })
})

describe('lastDayOfMonth', () => {
  it('うるう年の2月', () => {
    expect(lastDayOfMonth(2024, 2)).toBe(29)
    expect(lastDayOfMonth(2026, 2)).toBe(28)
  })

  it('世紀年は4で割れても100で割れれば平年（1900年）', () => {
    expect(lastDayOfMonth(1900, 2)).toBe(28)
  })

  it('400で割り切れる世紀年はうるう年（2000年）', () => {
    expect(lastDayOfMonth(2000, 2)).toBe(29)
  })
})

describe('resolveObservedDueDate', () => {
  it('休日補正を使わないならそのまま', () => {
    expect(resolveObservedDueDate('2026-05-31', false)).toEqual({
      observedOn: '2026-05-31',
      reason: null,
    })
  })

  it('開庁日ならそのままで理由も付かない', () => {
    expect(resolveObservedDueDate('2026-07-31', true)).toEqual({
      observedOn: '2026-07-31',
      reason: null,
    })
  })

  it('日曜なら翌開庁日にずらし理由を付ける', () => {
    expect(resolveObservedDueDate('2026-05-31', true)).toEqual({
      observedOn: '2026-06-01',
      reason: '日曜',
    })
  })

  it('祝日なら祝日名を理由にする', () => {
    expect(resolveObservedDueDate('2026-01-01', true)).toEqual({
      observedOn: '2026-01-02',
      reason: '元日',
    })
  })
})
