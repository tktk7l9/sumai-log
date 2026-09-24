import { describe, expect, it } from 'vitest'

import type { EventWithLinks, NewsEventRow } from '../server/repository'
import {
  isPastNews,
  groupNewsByDate,
  newsToScheduleEvents,
  nextDay,
  toScheduleEvents,
  toScheduleStamp,
} from './scheduleEvents'

const base: EventWithLinks = {
  id: 'e1',
  title: '予定',
  kind: 'visit',
  startsAt: '2030-01-05',
  endsAt: null,
  allDay: true,
  placeId: null,
  vendorId: null,
  propertyId: null,
  note: null,
  createdBy: 'test@example.com',
  createdAt: '2030-01-01 00:00:00',
  updatedAt: '2030-01-01 00:00:00',
  placeName: null,
  vendorName: null,
  propertyName: null,
}

const ev = (overrides: Partial<EventWithLinks>): EventWithLinks => ({ ...base, ...overrides })

describe('nextDay', () => {
  it('日・月末・年末をまたぐ', () => {
    expect(nextDay('2030-01-05')).toBe('2030-01-06')
    expect(nextDay('2030-01-31')).toBe('2030-02-01')
    expect(nextDay('2030-12-31')).toBe('2031-01-01')
  })
})

describe('toScheduleEvents', () => {
  it('終日フラグのイベントは 00:00:00〜翌日 00:00:00、色は種別による', () => {
    const [result] = toScheduleEvents([
      ev({ id: 'a', title: '終日イベント', kind: 'visit', startsAt: '2030-01-05', allDay: true }),
    ])
    expect(result).toEqual({
      id: 'a',
      title: '終日イベント',
      start: '2030-01-05 00:00:00',
      end: '2030-01-06 00:00:00',
      color: 'clay',
      payload: { kind: 'own', eventId: 'a', past: false },
    })
  })

  it('日付のみの startsAt は allDay フラグが無くても終日扱い', () => {
    const [result] = toScheduleEvents([
      ev({ id: 'b', title: '打合せ', kind: 'meeting', startsAt: '2030-01-06', allDay: false }),
    ])
    expect(result.start).toBe('2030-01-06 00:00:00')
    expect(result.end).toBe('2030-01-07 00:00:00')
    expect(result.color).toBe('blue')
  })

  it('終了時刻ありの時刻指定イベント', () => {
    const [result] = toScheduleEvents([
      ev({
        id: 'c',
        title: '内覧',
        kind: 'viewing',
        startsAt: '2030-01-07T10:00:00+09:00',
        endsAt: '2030-01-07T11:30:00+09:00',
        allDay: false,
      }),
    ])
    expect(result.start).toBe('2030-01-07 10:00:00')
    expect(result.end).toBe('2030-01-07 11:30:00')
    expect(result.color).toBe('teal')
  })

  it('終了時刻が無ければ開始の 60 分後', () => {
    const [result] = toScheduleEvents([
      ev({
        id: 'd',
        title: 'その他の予定',
        kind: 'other',
        startsAt: '2030-01-08T10:00:00+09:00',
        endsAt: null,
        allDay: false,
      }),
    ])
    expect(result.start).toBe('2030-01-08 10:00:00')
    expect(result.end).toBe('2030-01-08 11:00:00')
    expect(result.color).toBe('gray')
  })

  it('終了時刻が無く日をまたぐ場合は翌日にする', () => {
    const [result] = toScheduleEvents([
      ev({
        id: 'e',
        title: '深夜',
        kind: 'visit',
        startsAt: '2030-01-09T23:30:00+09:00',
        endsAt: null,
        allDay: false,
      }),
    ])
    expect(result.start).toBe('2030-01-09 23:30:00')
    expect(result.end).toBe('2030-01-10 00:30:00')
  })

  it('payload は自分たちの予定の id を持つ。now を渡さなければ past は立たない', () => {
    const [result] = toScheduleEvents([ev({ id: 'f' })])
    expect(result.payload).toEqual({ kind: 'own', eventId: 'f', past: false })
  })
})

const newsBase: NewsEventRow = {
  id: 'n1',
  vendorId: 'v1',
  vendorName: 'テスト工務店',
  url: 'https://example.com/news/1',
  title: '完成見学会のお知らせ',
  summary: null,
  publishedOn: '2030-01-01',
  eventStart: '2030-01-05',
  eventEnd: '2030-01-05',
  eventKind: '完成見学会',
  plannedEventId: null,
  mailId: null,
  firstSeenAt: '2030-01-01 00:00:00',
  createdAt: '2030-01-01 00:00:00',
  updatedAt: '2030-01-01 00:00:00',
}

const news = (overrides: Partial<NewsEventRow>): NewsEventRow => ({ ...newsBase, ...overrides })

describe('newsToScheduleEvents', () => {
  it('単日イベントは 00:00:00〜翌日 00:00:00、色は常に gray', () => {
    const [result] = newsToScheduleEvents([news({})])
    expect(result).toEqual({
      id: 'news-n1',
      title: 'テスト工務店 完成見学会のお知らせ',
      start: '2030-01-05 00:00:00',
      end: '2030-01-06 00:00:00',
      color: 'gray',
      payload: { kind: 'news', newsId: 'n1', past: false },
    })
  })

  it('複数日イベントは event_end の翌日まで', () => {
    const [result] = newsToScheduleEvents([
      news({ eventStart: '2030-01-05', eventEnd: '2030-01-07' }),
    ])
    expect(result.start).toBe('2030-01-05 00:00:00')
    expect(result.end).toBe('2030-01-08 00:00:00')
  })

  it('event_end が無ければ event_start と同じ日を終端にする', () => {
    const [result] = newsToScheduleEvents([news({ eventStart: '2030-01-05', eventEnd: null })])
    expect(result.start).toBe('2030-01-05 00:00:00')
    expect(result.end).toBe('2030-01-06 00:00:00')
  })

  it('event_start が無ければ（イベント未判定）除外する', () => {
    expect(newsToScheduleEvents([news({ eventStart: null, eventEnd: null })])).toEqual([])
  })

  it('planned_event_id が付いていても情報レイヤーからは消さない', () => {
    const [result] = newsToScheduleEvents([news({ plannedEventId: 'e1' })])
    expect(result.payload).toEqual({ kind: 'news', newsId: 'n1', past: false })
  })

  it('todayKey を渡すと終わった日程のお知らせに past が立つ', () => {
    const [done] = newsToScheduleEvents([news({ eventEnd: '2030-01-05' })], '2030-01-06')
    const [today] = newsToScheduleEvents([news({ eventEnd: '2030-01-05' })], '2030-01-05')
    expect(done.payload).toEqual({ kind: 'news', newsId: 'n1', past: true })
    expect(today.payload).toEqual({ kind: 'news', newsId: 'n1', past: false })
    // 色は元からグレーなので変えない（描画側が文字色を落とす）
    expect(done.color).toBe('gray')
  })
})

describe('groupNewsByDate', () => {
  it('公開日ごとにまとめ、新しい日を上にする（同じ日の中は渡した順）', () => {
    const groups = groupNewsByDate([
      news({ id: 'a', publishedOn: '2030-01-01' }),
      news({ id: 'b', publishedOn: '2030-01-03' }),
      news({ id: 'c', publishedOn: '2030-01-01' }),
    ])
    expect(groups.map((g) => [g.date, g.items.map((i) => i.news.id)])).toEqual([
      ['2030-01-03', ['b']],
      ['2030-01-01', ['a', 'c']],
    ])
  })

  it('イベント未判定のお知らせも含め、日付はイベント日ではなく公開日', () => {
    const [g] = groupNewsByDate([
      news({ publishedOn: '2030-02-01', eventStart: '2030-03-01', eventKind: null }),
    ])
    expect(g!.date).toBe('2030-02-01')
    expect(groupNewsByDate([])).toEqual([])
  })
})

describe('toScheduleStamp', () => {
  it('JST の ISO を Schedule と同じ形に揃える', () => {
    expect(toScheduleStamp('2030-01-05T09:30:00+09:00')).toBe('2030-01-05 09:30:00')
  })

  it('日付だけなら 00:00:00 を補う', () => {
    expect(toScheduleStamp('2030-01-05')).toBe('2030-01-05 00:00:00')
  })
})

describe('isPastNews', () => {
  it('日程を持たないお知らせは過去扱いしない（公開日は常に過去のため）', () => {
    expect(isPastNews({ eventStart: null, eventEnd: null }, '2030-01-05')).toBe(false)
  })

  it('終了日の当日はまだ過去ではない', () => {
    expect(isPastNews({ eventStart: '2030-01-05', eventEnd: null }, '2030-01-05')).toBe(false)
    expect(isPastNews({ eventStart: '2030-01-04', eventEnd: '2030-01-05' }, '2030-01-05')).toBe(
      false,
    )
  })

  it('終了日を過ぎたら過去', () => {
    expect(isPastNews({ eventStart: '2030-01-05', eventEnd: null }, '2030-01-06')).toBe(true)
    expect(isPastNews({ eventStart: '2030-01-04', eventEnd: '2030-01-05' }, '2030-01-06')).toBe(
      true,
    )
  })
})

describe('toScheduleEvents（終わった予定の色）', () => {
  it('終了時刻を過ぎた予定はグレーになり payload.past が立つ', () => {
    const [result] = toScheduleEvents(
      [
        ev({
          id: 'p1',
          kind: 'visit',
          startsAt: '2030-01-05T10:00:00+09:00',
          endsAt: '2030-01-05T11:00:00+09:00',
          allDay: false,
        }),
      ],
      '2030-01-05T12:00:00+09:00',
    )
    expect(result.color).toBe('gray')
    expect(result.payload).toEqual({ kind: 'own', eventId: 'p1', past: true })
  })

  it('まだ終わっていない予定は種別の色のまま', () => {
    const [result] = toScheduleEvents(
      [
        ev({
          id: 'p2',
          kind: 'visit',
          startsAt: '2030-01-05T10:00:00+09:00',
          endsAt: '2030-01-05T11:00:00+09:00',
          allDay: false,
        }),
      ],
      '2030-01-05T10:30:00+09:00',
    )
    expect(result.color).toBe('clay')
    expect(result.payload).toEqual({ kind: 'own', eventId: 'p2', past: false })
  })

  it('終日の予定はその日のうちは過去にならず、翌日から過去になる', () => {
    const allDay = ev({ id: 'p3', kind: 'meeting', startsAt: '2030-01-05', allDay: true })
    expect(toScheduleEvents([allDay], '2030-01-05T23:59:00+09:00')[0].color).toBe('blue')
    expect(toScheduleEvents([allDay], '2030-01-06T00:00:00+09:00')[0].color).toBe('gray')
  })
})

describe('groupNewsByDate（終わった日程）', () => {
  it('todayKey を渡すと終わった日程のお知らせに past が立つ。日程の無いものは立たない', () => {
    const [g] = groupNewsByDate(
      [
        news({ id: 'done', eventEnd: '2030-01-05' }),
        news({ id: 'none', eventStart: null, eventEnd: null, eventKind: null }),
      ],
      '2030-01-06',
    )
    expect(g!.items.map((i) => [i.news.id, i.past])).toEqual([
      ['done', true],
      ['none', false],
    ])
    expect(groupNewsByDate([news({ eventEnd: '2030-01-05' })])[0]!.items[0]!.past).toBe(false)
  })
})
