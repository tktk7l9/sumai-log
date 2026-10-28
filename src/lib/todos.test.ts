import { describe, expect, it } from 'vitest'

import {
  compareDone,
  compareOpen,
  dueLabel,
  filterTodos,
  groupTodos,
  homeTodos,
  matchesWho,
  sectionOf,
  type TodoLike,
} from './todos'

const TODAY = '2026-10-28'
const ME = 'owner@example.com'
const OTHER = 'partner@example.com'

function todo(over: Partial<TodoLike> & { id: string }): TodoLike {
  return {
    title: over.id,
    list: 'other',
    assignee: null,
    dueOn: null,
    doneAt: null,
    createdAt: '2026-10-01 00:00:00',
    ...over,
  }
}

describe('sectionOf', () => {
  it('puts items in overdue / today / week / later / undated / done', () => {
    expect(sectionOf(todo({ id: 'a', dueOn: '2026-10-27' }), TODAY)).toBe('overdue')
    expect(sectionOf(todo({ id: 'b', dueOn: TODAY }), TODAY)).toBe('today')
    expect(sectionOf(todo({ id: 'c', dueOn: '2026-11-04' }), TODAY)).toBe('week')
    expect(sectionOf(todo({ id: 'd', dueOn: '2026-11-05' }), TODAY)).toBe('later')
    expect(sectionOf(todo({ id: 'e' }), TODAY)).toBe('undated')
    expect(
      sectionOf(todo({ id: 'f', dueOn: '2026-10-01', doneAt: '2026-10-27T10:00:00+09:00' }), TODAY),
    ).toBe('done')
  })
})

describe('groupTodos', () => {
  it('sorts open items by due date then creation, undated last, and done newest first', () => {
    const g = groupTodos(
      [
        todo({ id: 'later2', dueOn: '2026-12-01', createdAt: '2026-10-02 00:00:00' }),
        todo({ id: 'later1', dueOn: '2026-12-01', createdAt: '2026-10-01 00:00:00' }),
        todo({ id: 'later0', dueOn: '2026-11-20' }),
        todo({ id: 'u2', createdAt: '2026-10-03 00:00:00' }),
        todo({ id: 'u1', createdAt: '2026-10-02 00:00:00' }),
        todo({ id: 'd-old', doneAt: '2026-10-27T09:00:00+09:00' }),
        todo({ id: 'd-new', doneAt: '2026-10-28T09:00:00+09:00' }),
        todo({ id: 'd-same', doneAt: '2026-10-28T09:00:00+09:00' }),
      ],
      TODAY,
    )
    expect(g.later.map((t) => t.id)).toEqual(['later0', 'later1', 'later2'])
    expect(g.undated.map((t) => t.id)).toEqual(['u1', 'u2'])
    expect(g.done.map((t) => t.id)).toEqual(['d-new', 'd-same', 'd-old'])
    expect(g.overdue).toEqual([])
    expect(g.today).toEqual([])
    expect(g.week).toEqual([])
  })

  it('drops finished items older than 30 days', () => {
    const g = groupTodos(
      [
        todo({ id: 'kept', doneAt: '2026-09-28T00:00:00+09:00' }),
        todo({ id: 'gone', doneAt: '2026-09-27T23:00:00+09:00' }),
      ],
      TODAY,
    )
    expect(g.done.map((t) => t.id)).toEqual(['kept'])
  })

  it('compareOpen puts undated after dated and orders dated by date', () => {
    const dated = todo({ id: 'd', dueOn: '2026-11-01' })
    const later = todo({ id: 'l', dueOn: '2026-11-02' })
    const undated = todo({ id: 'u' })
    expect(compareOpen(undated, dated)).toBe(1)
    expect(compareOpen(dated, undated)).toBe(-1)
    expect(compareOpen(dated, later)).toBe(-1)
    expect(compareOpen(later, dated)).toBe(1)
  })

  it('compareDone orders newest first either way round', () => {
    const older = todo({ id: 'o', doneAt: '2026-10-27T00:00:00+09:00' })
    const newer = todo({ id: 'n', doneAt: '2026-10-28T00:00:00+09:00' })
    expect(compareDone(older, newer)).toBe(1)
    expect(compareDone(newer, older)).toBe(-1)
  })

  it('compareOpen and compareDone return 0 for equal keys', () => {
    const a = todo({ id: 'a' })
    const b = todo({ id: 'b' })
    expect(compareOpen(a, b)).toBe(0)
    expect(
      compareOpen(
        todo({ id: 'x', dueOn: '2026-11-01' }),
        todo({ id: 'y', dueOn: '2026-11-01', createdAt: '2026-10-00' }),
      ),
    ).toBe(1)
    expect(compareDone(a, b)).toBe(0)
  })
})

describe('matchesWho / filterTodos', () => {
  const mine = todo({ id: 'mine', assignee: ME, list: 'move' })
  const theirs = todo({ id: 'theirs', assignee: OTHER, list: 'account' })
  const both = todo({ id: 'both', list: 'money' })

  it('resolves me / other / both against the viewer', () => {
    expect(matchesWho(mine, 'me', ME)).toBe(true)
    expect(matchesWho(theirs, 'me', ME)).toBe(false)
    expect(matchesWho(theirs, 'other', ME)).toBe(true)
    expect(matchesWho(both, 'other', ME)).toBe(false)
    expect(matchesWho(both, 'both', ME)).toBe(true)
    expect(matchesWho(mine, undefined, ME)).toBe(true)
  })

  it('combines the list and who filters', () => {
    const all = [mine, theirs, both]
    expect(filterTodos(all, {}, ME).map((t) => t.id)).toEqual(['mine', 'theirs', 'both'])
    expect(filterTodos(all, { list: 'account' }, ME).map((t) => t.id)).toEqual(['theirs'])
    expect(filterTodos(all, { list: 'move', who: 'other' }, ME)).toEqual([])
    expect(filterTodos(all, { who: 'both' }, ME).map((t) => t.id)).toEqual(['both'])
  })
})

describe('dueLabel', () => {
  it('counts down within the week, says how many days overdue, and shows the date further away', () => {
    expect(dueLabel(null, TODAY)).toBeNull()
    expect(dueLabel('2026-10-26', TODAY)).toBe('2日過ぎ')
    expect(dueLabel(TODAY, TODAY)).toBe('今日')
    expect(dueLabel('2026-10-29', TODAY)).toBe('明日')
    expect(dueLabel('2026-10-30', TODAY)).toBe('明後日')
    expect(dueLabel('2026-11-04', TODAY)).toBe('あと7日')
    expect(dueLabel('2026-11-05', TODAY)).toBe('11/5')
  })
})

describe('homeTodos', () => {
  it('returns overdue, today and this week in that order, capped', () => {
    const items = [
      todo({ id: 'w', dueOn: '2026-11-02' }),
      todo({ id: 't', dueOn: TODAY }),
      todo({ id: 'o', dueOn: '2026-10-20' }),
      todo({ id: 'l', dueOn: '2026-12-20' }),
      todo({ id: 'u' }),
      todo({ id: 'd', dueOn: TODAY, doneAt: '2026-10-28T08:00:00+09:00' }),
    ]
    expect(homeTodos(items, TODAY, 5).map((t) => t.id)).toEqual(['o', 't', 'w'])
    expect(homeTodos(items, TODAY, 2).map((t) => t.id)).toEqual(['o', 't'])
  })
})
