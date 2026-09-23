import { describe, expect, it } from 'vitest'

import { planButtonState } from './planButton'

const today = '2026-09-20'

describe('planButtonState', () => {
  it('予定化済みなら view', () => {
    expect(
      planButtonState({ plannedEventId: 'e1', eventStart: '2026-01-01', eventEnd: null }, today),
    ).toEqual({ kind: 'view' })
  })
  it('日程が無ければ none（ボタンを出さない）', () => {
    expect(
      planButtonState({ plannedEventId: null, eventStart: null, eventEnd: null }, today),
    ).toEqual({
      kind: 'none',
    })
  })
  it('終了日（無ければ開始日）が今日より前なら ended', () => {
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
  it('今日以降なら開始日付きの plan（複数日は終了日が今日以降なら出す）', () => {
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
