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
  it('crosses a day, a month end and a year end', () => {
    expect(nextDay('2030-01-05')).toBe('2030-01-06')
    expect(nextDay('2030-01-31')).toBe('2030-02-01')
    expect(nextDay('2030-12-31')).toBe('2031-01-01')
  })
})

describe('toScheduleEvents', () => {
  it('maps an all-day event to 00:00:00 through 00:00:00 the next day, with the color by kind', () => {
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

  it('treats a date-only startsAt as all-day even without the allDay flag', () => {
    const [result] = toScheduleEvents([
      ev({ id: 'b', title: '打合せ', kind: 'meeting', startsAt: '2030-01-06', allDay: false }),
    ])
    expect(result.start).toBe('2030-01-06 00:00:00')
    expect(result.end).toBe('2030-01-07 00:00:00')
    expect(result.color).toBe('blue')
  })

  it('handles a timed event with an end time', () => {
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

  it('ends 60 minutes after the start when there is no end time', () => {
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

  it('rolls over to the next day when there is no end time and it crosses midnight', () => {
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

  it('carries the id of our own event in the payload. past is not set unless now is passed', () => {
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
  it('maps a single-day event to 00:00:00 through 00:00:00 the next day, always in gray', () => {
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

  it('extends a multi-day event to the day after event_end', () => {
    const [result] = newsToScheduleEvents([
      news({ eventStart: '2030-01-05', eventEnd: '2030-01-07' }),
    ])
    expect(result.start).toBe('2030-01-05 00:00:00')
    expect(result.end).toBe('2030-01-08 00:00:00')
  })

  it('ends on the same day as event_start when there is no event_end', () => {
    const [result] = newsToScheduleEvents([news({ eventStart: '2030-01-05', eventEnd: null })])
    expect(result.start).toBe('2030-01-05 00:00:00')
    expect(result.end).toBe('2030-01-06 00:00:00')
  })

  it('excludes rows without event_start (not detected as an event)', () => {
    expect(newsToScheduleEvents([news({ eventStart: null, eventEnd: null })])).toEqual([])
  })

  it('does not remove a row from the information layer even when it has planned_event_id', () => {
    const [result] = newsToScheduleEvents([news({ plannedEventId: 'e1' })])
    expect(result.payload).toEqual({ kind: 'news', newsId: 'n1', past: false })
  })

  it('sets past on vendor news whose dates are over when todayKey is passed', () => {
    const [done] = newsToScheduleEvents([news({ eventEnd: '2030-01-05' })], '2030-01-06')
    const [today] = newsToScheduleEvents([news({ eventEnd: '2030-01-05' })], '2030-01-05')
    expect(done.payload).toEqual({ kind: 'news', newsId: 'n1', past: true })
    expect(today.payload).toEqual({ kind: 'news', newsId: 'n1', past: false })
    // The color is gray to begin with, so it does not change (the renderer dims the text color)
    expect(done.color).toBe('gray')
  })
})

describe('groupNewsByDate', () => {
  it('groups by publication date with newer dates first (input order within a day)', () => {
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

  it('includes news not detected as an event, and dates by publication date, not event date', () => {
    const [g] = groupNewsByDate([
      news({ publishedOn: '2030-02-01', eventStart: '2030-03-01', eventKind: null }),
    ])
    expect(g!.date).toBe('2030-02-01')
    expect(groupNewsByDate([])).toEqual([])
  })
})

describe('toScheduleStamp', () => {
  it('aligns a JST ISO string to the same shape as Schedule', () => {
    expect(toScheduleStamp('2030-01-05T09:30:00+09:00')).toBe('2030-01-05 09:30:00')
  })

  it('fills in 00:00:00 for a date-only value', () => {
    expect(toScheduleStamp('2030-01-05')).toBe('2030-01-05 00:00:00')
  })
})

describe('isPastNews', () => {
  it('does not treat news without dates as past (the publication date is always in the past)', () => {
    expect(isPastNews({ eventStart: null, eventEnd: null }, '2030-01-05')).toBe(false)
  })

  it('is not yet past on the end date itself', () => {
    expect(isPastNews({ eventStart: '2030-01-05', eventEnd: null }, '2030-01-05')).toBe(false)
    expect(isPastNews({ eventStart: '2030-01-04', eventEnd: '2030-01-05' }, '2030-01-05')).toBe(
      false,
    )
  })

  it('is past once the end date has passed', () => {
    expect(isPastNews({ eventStart: '2030-01-05', eventEnd: null }, '2030-01-06')).toBe(true)
    expect(isPastNews({ eventStart: '2030-01-04', eventEnd: '2030-01-05' }, '2030-01-06')).toBe(
      true,
    )
  })
})

describe('toScheduleEvents (color of finished events)', () => {
  it('turns an event past its end time gray and sets payload.past', () => {
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

  it('keeps the kind color for an event that has not finished yet', () => {
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

  it('keeps an all-day event non-past during that day and makes it past from the next day', () => {
    const allDay = ev({ id: 'p3', kind: 'meeting', startsAt: '2030-01-05', allDay: true })
    expect(toScheduleEvents([allDay], '2030-01-05T23:59:00+09:00')[0].color).toBe('blue')
    expect(toScheduleEvents([allDay], '2030-01-06T00:00:00+09:00')[0].color).toBe('gray')
  })
})

describe('groupNewsByDate (finished dates)', () => {
  it('sets past on vendor news whose dates are over when todayKey is passed. Not on news without dates', () => {
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
