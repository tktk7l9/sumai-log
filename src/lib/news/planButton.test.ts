import { describe, expect, it } from 'vitest'

import { planButtonState } from './planButton'

const today = '2026-09-20'

describe('planButtonState', () => {
  it('view when already turned into an event', () => {
    expect(
      planButtonState({ plannedEventId: 'e1', eventStart: '2026-01-01', eventEnd: null }, today),
    ).toEqual({ kind: 'view' })
  })
  it('none when there are no event dates (no button is shown)', () => {
    expect(
      planButtonState({ plannedEventId: null, eventStart: null, eventEnd: null }, today),
    ).toEqual({
      kind: 'none',
    })
  })
  it('ended when the end date (or the start date when absent) is before today', () => {
    expect(
      planButtonState({ plannedEventId: null, eventStart: '2026-09-19', eventEnd: null }, today),
    ).toEqual({ kind: 'ended' })
    expect(
      planButtonState(
        { plannedEventId: null, eventStart: '2026-09-12', eventEnd: '2026-09-19' },
        today,
      ),
    ).toEqual({ kind: 'ended' })
  })
  it('plan with the start date when today or later (multi-day is shown when the end date is today or later)', () => {
    expect(
      planButtonState(
        { plannedEventId: null, eventStart: '2026-09-27', eventEnd: '2026-09-28' },
        today,
      ),
    ).toEqual({ kind: 'plan', label: '2026/09/27(日)に行く' })
    expect(
      planButtonState(
        { plannedEventId: null, eventStart: '2026-09-19', eventEnd: '2026-09-20' },
        today,
      ),
    ).toEqual({ kind: 'plan', label: '2026/09/19(土)に行く' })
    expect(
      planButtonState({ plannedEventId: null, eventStart: '2026-09-20', eventEnd: null }, today),
    ).toEqual({ kind: 'plan', label: '2026/09/20(日)に行く' })
  })
})
