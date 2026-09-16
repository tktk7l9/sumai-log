import { describe, expect, it } from 'vitest'

import type { EventWithLinks } from '../server/repository'
import { nextDay, toScheduleEvents } from './scheduleEvents'

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
