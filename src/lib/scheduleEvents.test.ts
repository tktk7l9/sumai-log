import { describe, expect, it } from 'vitest'

import type { EventWithLinks, NewsEventRow } from '../server/repository'
import {
  newsToAgendaEvents,
  newsToScheduleEvents,
  nextDay,
  toScheduleEvents,
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
      payload: { kind: 'own', eventId: 'a' },
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

  it('payload は自分たちの予定の id を持つ', () => {
    const [result] = toScheduleEvents([ev({ id: 'f' })])
    expect(result.payload).toEqual({ kind: 'own', eventId: 'f' })
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
      payload: { kind: 'news', newsId: 'n1' },
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
    expect(result.payload).toEqual({ kind: 'news', newsId: 'n1' })
  })
})

describe('newsToAgendaEvents', () => {
  it('公開日（publishedOn）の終日イベントにする。event_start は見ない', () => {
    const [result] = newsToAgendaEvents([
      news({ publishedOn: '2030-02-01', eventStart: null, eventEnd: null, eventKind: null }),
    ])
    expect(result).toEqual({
      id: 'news-n1',
      title: 'テスト工務店 完成見学会のお知らせ',
      start: '2030-02-01 00:00:00',
      end: '2030-02-02 00:00:00',
      color: 'gray',
      payload: { kind: 'news', newsId: 'n1' },
    })
  })

  it('イベント未判定（event_kind/event_start が無い）お知らせも除外せず含める', () => {
    expect(
      newsToAgendaEvents([news({ eventStart: null, eventEnd: null, eventKind: null })]),
    ).toHaveLength(1)
  })

  it('月末・年末をまたぐ公開日も翌日が end になる', () => {
    const [result] = newsToAgendaEvents([news({ publishedOn: '2030-12-31' })])
    expect(result.end).toBe('2031-01-01 00:00:00')
  })

  it('複数件は渡した順のまま変換する', () => {
    const results = newsToAgendaEvents([
      news({ id: 'a', publishedOn: '2030-01-01' }),
      news({ id: 'b', publishedOn: '2030-01-02' }),
    ])
    expect(results.map((r) => r.id)).toEqual(['news-a', 'news-b'])
  })
})
