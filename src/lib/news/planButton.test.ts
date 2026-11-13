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
  it('plan with the start date when today or later (a multi-day event under way is offered for today)', () => {
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
    ).toEqual({ kind: 'plan', label: '2026/09/20(日)に行く' })
    expect(
      planButtonState({ plannedEventId: null, eventStart: '2026-09-20', eventEnd: null }, today),
    ).toEqual({ kind: 'plan', label: '2026/09/20(日)に行く' })
  })

  it('offers today, not a day already past, for a multi-day event that has started', () => {
    expect(
      planButtonState(
        { plannedEventId: null, eventStart: '2026-11-14', eventEnd: '2026-11-15' },
        '2026-11-15',
      ),
    ).toEqual({ kind: 'plan', label: '2026/11/15(日)に行く' })
  })
})
