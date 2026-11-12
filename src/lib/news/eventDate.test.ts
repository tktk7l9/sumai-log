import { describe, expect, it } from 'vitest'

import { extractEvent, inferYear } from './eventDate'

describe('inferYear', () => {
  it('takes a month 2 or more months before the published month as the next year', () => {
    // Published in December, and January is 11 months before = 2 or more months before -> next year
    expect(inferYear(1, '2026-12-20')).toBe(2027)
  })

  it('exactly 1 month before the published month is the same year (not 2 or more months before)', () => {
    expect(inferYear(11, '2026-12-20')).toBe(2026)
    expect(inferYear(1, '2026-02-01')).toBe(2026)
  })

  it('the same month as the published month, or a later one, is the same year', () => {
    expect(inferYear(8, '2026-08-01')).toBe(2026)
    expect(inferYear(9, '2026-08-01')).toBe(2026)
  })

  it('the month before a January post is December of the year before (a report on last month)', () => {
    expect(inferYear(12, '2027-01-06')).toBe(2026)
  })

  it('two months before a January post is still the coming November', () => {
    expect(inferYear(11, '2027-01-06')).toBe(2027)
  })
})

describe('extractEvent', () => {
  it('spec example 1: 《9月12日(土)開催》 is a "見学会" on a single day', () => {
    const text = '【お住まい見学会】Clam Chowder House《9月12日(土)開催》'
    expect(extractEvent(text, '2026-08-20')).toEqual({
      kind: '見学会',
      start: '2026-09-12',
      end: '2026-09-12',
    })
  })

  it('spec example 2: 7/6-/7 is a "完成見学会" that ends in the same month', () => {
    const text = '7/6-/7『開拓者の家Ⅱ』完成見学会のおしらせ'
    expect(extractEvent(text, '2026-06-01')).toEqual({
      kind: '完成見学会',
      start: '2026-07-06',
      end: '2026-07-07',
    })
  })

  it('spec example 3: a list (D日・D日) is a "構造見学会" with a range', () => {
    const text = '"均悉想和" 構造見学会 11月17日(土)・18日(日)'
    expect(extractEvent(text, '2026-10-01')).toEqual({
      kind: '構造見学会',
      start: '2026-11-17',
      end: '2026-11-18',
    })
  })

  it('M/D-M/D (range crossing months. Within 14 days, so it stays a range)', () => {
    const text = 'セミナー 9/25-10/3のご案内'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: 'セミナー',
      start: '2026-09-25',
      end: '2026-10-03',
    })
  })

  it('M/D〜M/D (wave dash U+301C)', () => {
    const text = '相談会 9/12〜9/20'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '相談会',
      start: '2026-09-12',
      end: '2026-09-20',
    })
  })

  it('M/D～D (full-width tilde U+FF5E, only the day of the same-month end)', () => {
    const text = 'イベント 9/12～15'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: 'イベント',
      start: '2026-09-12',
      end: '2026-09-15',
    })
  })

  it('M/D alone (no range)', () => {
    const text = '見学会 9/12開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '見学会',
      start: '2026-09-12',
      end: '2026-09-12',
    })
  })

  it('M/D.D (list of days separated by a period) ends in the same month', () => {
    const text = '完成見学会 8/22.23開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '完成見学会',
      start: '2026-08-22',
      end: '2026-08-23',
    })
  })

  it('M/D・D (list of days separated by a middle dot) ends in the same month', () => {
    const text = '見学会 7/22・23開催'
    expect(extractEvent(text, '2026-07-01')).toEqual({
      kind: '見学会',
      start: '2026-07-22',
      end: '2026-07-23',
    })
  })

  it('M/D,D,D (comma separated, 3 or more repeats) ends on the last listed day', () => {
    const text = 'イベント 8/22,23,24開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: 'イベント',
      start: '2026-08-22',
      end: '2026-08-24',
    })
  })

  it('M/D、D (separated by an ideographic comma) is also picked up as a list of days', () => {
    const text = 'セミナー 9/5、6開催'
    expect(extractEvent(text, '2026-08-20')).toEqual({
      kind: 'セミナー',
      start: '2026-09-05',
      end: '2026-09-06',
    })
  })

  it('stops reading the list when an item is not greater than the previous day (avoids confusion with decimal notation)', () => {
    // The 5 of "7/22.5割" is smaller than 22, so it is not a list and stays a lone 7/22
    const text = '見学会 7/22.5割引でご案内'
    expect(extractEvent(text, '2026-07-01')).toEqual({
      kind: '見学会',
      start: '2026-07-22',
      end: '2026-07-22',
    })
  })

  it('stops reading the list when an item is a non-existent day (the 32nd etc.)', () => {
    const text = '見学会 8/1.32開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '見学会',
      start: '2026-08-01',
      end: '2026-08-01',
    })
  })

  it('does not pick up the 3rd digit of a list item (a 4-digit day) as a day (1-2 digits only)', () => {
    // The "234" of "8/1.234" is not 1-2 digits, so it is not a list and stays a lone 8/1
    const text = '見学会 8/1.234開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '見学会',
      start: '2026-08-01',
      end: '2026-08-01',
    })
  })

  it('treats a lone M/D followed by a weekday note as a date, without the fraction check', () => {
    const text = '見学会 9/12(土)開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '見学会',
      start: '2026-09-12',
      end: '2026-09-12',
    })
  })

  it('fraction notation (preceded by "の") is a false M/D detection and is not a date', () => {
    // Equivalent to "参加費は通常の1/2です" (a kind word is added to make it a meaningful
    // regression test)
    const text = '見学会 参加費は通常の1/2です'
    expect(extractEvent(text, '2026-08-01')).toBeNull()
  })

  it('fraction notation (preceded by "先着", followed by "程度") is a false M/D detection and is not a date', () => {
    const text = 'セミナー 先着1/2程度'
    expect(extractEvent(text, '2026-08-01')).toBeNull()
  })

  it('YYYY年M月D日 (an explicit year wins over the year of the published date)', () => {
    const text = '完成見学会 2026年9月12日開催'
    // Even with a published date in a completely different year, the explicit year of the body is used
    expect(extractEvent(text, '2020-01-01')).toEqual({
      kind: '完成見学会',
      start: '2026-09-12',
      end: '2026-09-12',
    })
  })

  it('year crossing: published in December, "1月10日" is the next year', () => {
    const text = '見学会 1月10日開催'
    expect(extractEvent(text, '2026-12-20')).toEqual({
      kind: '見学会',
      start: '2027-01-10',
      end: '2027-01-10',
    })
  })

  it('a standalone "D日" between two M月D日 still binds to the preceding month (skip midway in the backward scan)', () => {
    // "19日" comes right after "11月17日" and before "12月1日". It must bind to the preceding
    // month (November) and must not be pulled by the later "12月1日" that has not appeared yet
    // (11/17 to 12/1 is exactly 14 days, so it is not clamped and the expected range can be
    // checked).
    const text = '見学会 11月17日・19日、12月1日にも開催'
    expect(extractEvent(text, '2026-10-01')).toEqual({
      kind: '見学会',
      start: '2026-11-17',
      end: '2026-12-01',
    })
  })

  it('computes min/max correctly even when the list is in descending order', () => {
    const text = '見学会 11月17日(土)・15日(日)'
    expect(extractEvent(text, '2026-10-01')).toEqual({
      kind: '見学会',
      start: '2026-11-15',
      end: '2026-11-17',
    })
  })

  it('"オープンハウス" becomes "見学会" even without containing "見学会"', () => {
    const text = 'オープンハウス 9/12開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '見学会',
      start: '2026-09-12',
      end: '2026-09-12',
    })
  })

  it('null without a kind word, even when there is a date', () => {
    expect(extractEvent('9月12日に工事完了予定', '2026-08-01')).toBeNull()
  })

  it('null when there is no date at all', () => {
    expect(extractEvent('セミナーのご案内', '2026-08-01')).toBeNull()
  })

  it('ignores a bare "D日" with no clue for the month and does not make an event', () => {
    expect(extractEvent('見学会 15日から受付開始', '2026-08-01')).toBeNull()
  })

  it('drops a non-existent month such as "13月" (so it does not become an event)', () => {
    expect(extractEvent('見学会 13月1日開催', '2026-08-01')).toBeNull()
  })

  it('drops a non-existent day such as "1月32日" (a month with 31 days)', () => {
    expect(extractEvent('見学会 1月32日開催', '2026-08-01')).toBeNull()
  })

  it('drops a month or day below 1 such as "0月" / "0日", which do not exist either', () => {
    expect(extractEvent('見学会 0月5日開催', '2026-08-01')).toBeNull()
    expect(extractEvent('見学会 9月0日開催', '2026-08-01')).toBeNull()
  })

  it('drops "2月29日" when the inferred year is not a leap year', () => {
    // Published on 2026-01-15 (January), so the month stays in the same year 2026. 2026 is not a leap year.
    expect(extractEvent('見学会 2月29日開催', '2026-01-15')).toBeNull()
  })

  it('accepts "2月29日" when the inferred year is a leap year (non-century year divisible by 4)', () => {
    expect(extractEvent('見学会 2月29日開催', '2028-01-15')).toEqual({
      kind: '見学会',
      start: '2028-02-29',
      end: '2028-02-29',
    })
  })

  it('accepts "2月29日" when the inferred year is a century year divisible by 400 (leap year)', () => {
    expect(extractEvent('見学会 2月29日開催', '2000-01-15')).toEqual({
      kind: '見学会',
      start: '2000-02-29',
      end: '2000-02-29',
    })
  })

  it('drops "2月29日" when the inferred year is a century year divisible by 100 but not by 400', () => {
    expect(extractEvent('見学会 2月29日開催', '1900-01-15')).toBeNull()
  })

  describe('a range longer than 14 days is aligned to the start date only', () => {
    it('only the start date remains when distant dates such as a reception period and the event date are mixed (reception start is the first date in the body)', () => {
      // The 8/1 of "8月1日より受付開始" and the 9/12 of "見学会は9月12日" are 42 days apart.
      // That start becomes the smallest date in the body (the reception start date, 8/1)
      // instead of the event date (9/12) is a known trade-off of this simple min/max
      // heuristic (really hitting the event date needs understanding of natural language).
      const text = '8月1日より受付開始。見学会は9月12日(土)開催'
      expect(extractEvent(text, '2026-08-01')).toEqual({
        kind: '見学会',
        start: '2026-08-01',
        end: '2026-08-01',
      })
    })

    it('a range of exactly 14 days (the boundary) is not clamped and stays a range', () => {
      const text = '見学会 8/1〜8/15'
      expect(extractEvent(text, '2026-08-01')).toEqual({
        kind: '見学会',
        start: '2026-08-01',
        end: '2026-08-15',
      })
    })

    it('a range of 15 days (1 day over 14 days) becomes the start date only', () => {
      const text = '見学会 8/1〜8/16'
      expect(extractEvent(text, '2026-08-01')).toEqual({
        kind: '見学会',
        start: '2026-08-01',
        end: '2026-08-01',
      })
    })
  })
})

describe('a "D日" that is a count, not a day of the month', () => {
  const published = '2026-11-05'
  const on = (start: string, end = start) => ({ kind: '完成見学会', start, end })

  it.each([
    ['完成見学会 11月21日(土)・22日(日) 1日3組限定', on('2026-11-21', '2026-11-22')],
    ['【予約制】完成見学会 11月21日(土)〜23日(月・祝) 3日間限定', on('2026-11-21', '2026-11-23')],
    ['完成見学会 11月21日(土) 開催。3日前までにご予約ください', on('2026-11-21')],
    ['完成見学会 11月21日(土)、3日前までにご予約ください', on('2026-11-21')],
    ['完成見学会 11月21日(土)の1日だけ開催', on('2026-11-21')],
    ['完成見学会 11月7日(土) 毎月第3日曜は定休', on('2026-11-07')],
    ['完成見学会 11月7日(土) 工期は120日', on('2026-11-07')],
    ['完成見学会 11月7日(土) 2日目は予約制', on('2026-11-07')],
    ['完成見学会 11月7日(土) 開催から8日後に締切', on('2026-11-07')],
  ])('%s', (text, expected) => {
    expect(extractEvent(text, published)).toEqual(expected)
  })

  it('still reads a later day of the same month that is not written as a list', () => {
    const text = '完成見学会 11月21日(土)10:00〜17:00 / 22日(日)10:00〜15:00'
    expect(extractEvent(text, published)).toEqual(on('2026-11-21', '2026-11-22'))
  })

  it('does not carry the month across a sentence or a long gap', () => {
    expect(extractEvent('完成見学会 11月21日(土)開催。25日は定休日です', published)).toEqual(
      on('2026-11-21'),
    )
    const gap = 'あ'.repeat(41)
    expect(extractEvent(`完成見学会 11月21日(土)${gap}25日`, published)).toEqual(on('2026-11-21'))
  })

  it('reads a list joined by と / から / 及び', () => {
    expect(extractEvent('完成見学会 11月21日(土)と22日(日)', published)).toEqual(
      on('2026-11-21', '2026-11-22'),
    )
    expect(extractEvent('完成見学会 11月21日から23日まで', published)).toEqual(
      on('2026-11-21', '2026-11-23'),
    )
    expect(extractEvent('完成見学会 11月21日及び22日', published)).toEqual(
      on('2026-11-21', '2026-11-22'),
    )
  })
})

describe('slash dates as vendors really write them', () => {
  const published = '2026-11-05'
  const on = (start: string, end = start) => ({ kind: '完成見学会', start, end })

  it.each([
    ['11/14(土)・15(日) 完成見学会', on('2026-11-14', '2026-11-15')],
    ['11/14(土)、15(日) 完成見学会', on('2026-11-14', '2026-11-15')],
    ['11/14(土)〜15(日) 完成見学会', on('2026-11-14', '2026-11-15')],
    ['11/14(土)〜11/15(日) 完成見学会', on('2026-11-14', '2026-11-15')],
    ['11/14(土・祝) - 11/16(月) 完成見学会', on('2026-11-14', '2026-11-16')],
    ['11/14~15 完成見学会', on('2026-11-14', '2026-11-15')],
    ['11/14–15 完成見学会', on('2026-11-14', '2026-11-15')],
    ['完成見学会(12/12-20)', on('2026-12-12', '2026-12-20')],
    ['2026/11/21(土) 完成見学会', on('2026-11-21')],
    ['2026/11/21〜11/23 完成見学会', on('2026-11-21', '2026-11-23')],
    ['2026/12/28〜1/3 完成見学会', on('2026-12-28', '2027-01-03')],
    ['2026.11.21 完成見学会', on('2026-11-21')],
    ['2027.1.9(土) 完成見学会', on('2027-01-09')],
  ])('%s', (text, expected) => {
    expect(extractEvent(text, published)).toEqual(expected)
  })

  it('does not take a time, a count or a version for the end of a range or a list', () => {
    expect(extractEvent('11/14〜17:00 完成見学会', published)).toEqual(on('2026-11-14'))
    expect(extractEvent('11/14〜17時 完成見学会', published)).toEqual(on('2026-11-14'))
    expect(extractEvent('11/14(土)、15組限定の完成見学会', published)).toEqual(on('2026-11-14'))
    expect(extractEvent('11/14(土)・20名様まで 完成見学会', published)).toEqual(on('2026-11-14'))
    expect(extractEvent('完成見学会 11/14(土) ver2.11.21', published)).toEqual(on('2026-11-14'))
  })

  it('does not read the tail of a year as a month', () => {
    // 2026/13/1 is no date: neither "26/13" nor "13/1" may come out of it
    expect(extractEvent('完成見学会 2026/13/1', published)).toBeNull()
    expect(extractEvent('完成見学会 2026.13.1', published)).toBeNull()
  })
})

describe('full-width and compatibility characters', () => {
  it('reads full-width digits, slashes and brackets', () => {
    expect(extractEvent('１１月１４日（土）完成見学会', '2026-11-05')).toEqual({
      kind: '完成見学会',
      start: '2026-11-14',
      end: '2026-11-14',
    })
    expect(extractEvent('１１／１４（土）・１５（日）完成見学会', '2026-11-05')).toEqual({
      kind: '完成見学会',
      start: '2026-11-14',
      end: '2026-11-15',
    })
  })

  it('reads a kind word written in half-width katakana', () => {
    expect(extractEvent('ｾﾐﾅｰ 11月14日', '2026-11-05')).toEqual({
      kind: 'セミナー',
      start: '2026-11-14',
      end: '2026-11-14',
    })
  })
})

describe('a report on last month, published in January', () => {
  it('stays in the year before', () => {
    expect(extractEvent('12月20日の完成見学会レポート', '2027-01-06')).toEqual({
      kind: '完成見学会',
      start: '2026-12-20',
      end: '2026-12-20',
    })
    expect(
      extractEvent('12/19・20 完成見学会にご来場ありがとうございました', '2027-01-06'),
    ).toEqual({ kind: '完成見学会', start: '2026-12-19', end: '2026-12-20' })
  })
})

describe('long input', () => {
  it('reads one date followed by thousands of "N日" in linear time', () => {
    const text = `完成見学会 11月21日(土) ${'3日 '.repeat(200_000)}`
    const started = performance.now()
    expect(extractEvent(text, '2026-11-05')).toEqual({
      kind: '完成見学会',
      start: '2026-11-21',
      end: '2026-11-21',
    })
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('reads thousands of dates, slash lists and fractions in linear time', () => {
    const text = `完成見学会 ${'11月21日・22日 11/14(土)・15(日) の1/2 '.repeat(30_000)}`
    const started = performance.now()
    expect(extractEvent(text, '2026-11-05')).toEqual({
      kind: '完成見学会',
      start: '2026-11-14',
      end: '2026-11-22',
    })
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('does not join a "D日" across a gap longer than a join can be', () => {
    const text = `完成見学会 11月21日${' '.repeat(41)}・22日`
    expect(extractEvent(text, '2026-11-05')).toEqual({
      kind: '完成見学会',
      start: '2026-11-21',
      end: '2026-11-21',
    })
  })
})
