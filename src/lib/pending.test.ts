import { describe, expect, it } from 'vitest'

import { pendingVisitEvents, type PendingEvent } from './pending'

const ev = (
  id: string,
  startsAt: string,
  kind = 'visit',
  endsAt: string | null = null,
): PendingEvent => ({
  id,
  title: id,
  startsAt,
  endsAt,
  allDay: startsAt.length === 10,
  kind,
})

describe('pendingVisitEvents', () => {
  const now = '2030-01-10T12:00:00+09:00'
  it('終わった見学/内覧で記録が無いものを新しい順に返す', () => {
    const events = [
      ev('old', '2030-01-05'),
      ev('done', '2030-01-06'),
      ev('timed', '2030-01-10T09:00:00+09:00', 'viewing', '2030-01-10T10:00:00+09:00'),
      ev('later-today', '2030-01-10T13:00:00+09:00'),
      ev('future', '2030-01-12'),
      ev('meeting', '2030-01-04', 'meeting'),
      ev('today-allday', '2030-01-10'),
    ]
    expect(pendingVisitEvents(events, new Set(['done']), now).map((e) => e.id)).toEqual([
      'timed',
      'old',
    ])
  })
  it('空なら空', () => {
    expect(pendingVisitEvents([], new Set(), now)).toEqual([])
  })
})
