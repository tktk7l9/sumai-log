/**
 * Grouping, filtering and labelling of household to-dos (pure functions). The screen
 * (`/todos`) and the home block get their sections from here; "today" is always the
 * `todayKey` decided by the server so the page and its hydration agree.
 */
import { addDays } from './calendar'
import { daysUntil } from './freshness'

export type TodoLike = {
  id: string
  title: string
  list: string
  assignee: string | null
  dueOn: string | null
  doneAt: string | null
  createdAt: string
}

/** The sections of the list, in display order */
export const TODO_SECTIONS = ['overdue', 'today', 'week', 'later', 'undated', 'done'] as const
export type TodoSection = (typeof TODO_SECTIONS)[number]
export const TODO_SECTION_LABEL: Record<TodoSection, string> = {
  overdue: '期限切れ',
  today: '今日',
  week: '今週',
  later: 'あとで',
  undated: '期限なし',
  done: '完了',
}

/** "今週" covers today + the next WEEK_DAYS days */
export const WEEK_DAYS = 7
/** Done items older than this are not listed (they stay in the table) */
export const DONE_KEEP_DAYS = 30

/** Which section an item belongs to */
export function sectionOf(todo: TodoLike, todayKey: string): TodoSection {
  if (todo.doneAt) return 'done'
  if (!todo.dueOn) return 'undated'
  const days = daysUntil(todo.dueOn, todayKey)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= WEEK_DAYS) return 'week'
  return 'later'
}

/** Due ascending (undated last), then created ascending — a stable order for the open ones */
export function compareOpen(a: TodoLike, b: TodoLike): number {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1
    if (b.dueOn === null) return -1
    return a.dueOn < b.dueOn ? -1 : 1
  }
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
}

/** Newest finished first */
export function compareDone(a: TodoLike, b: TodoLike): number {
  const x = a.doneAt ?? ''
  const y = b.doneAt ?? ''
  return x > y ? -1 : x < y ? 1 : 0
}

/**
 * Splits into the sections. Finished items older than DONE_KEEP_DAYS are dropped. Every
 * section key is present (possibly empty) so the screen can iterate TODO_SECTIONS
 */
export function groupTodos<T extends TodoLike>(
  todos: readonly T[],
  todayKey: string,
): Record<TodoSection, T[]> {
  const out: Record<TodoSection, T[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    undated: [],
    done: [],
  }
  const doneFloor = addDays(todayKey, -DONE_KEEP_DAYS)
  for (const t of todos) {
    const s = sectionOf(t, todayKey)
    if (s === 'done' && t.doneAt!.slice(0, 10) < doneFloor) continue
    out[s].push(t)
  }
  for (const s of TODO_SECTIONS) out[s].sort(s === 'done' ? compareDone : compareOpen)
  return out
}

/** The "who" filter: 'me' / 'other' are relative to the viewer, 'both' = unassigned */
export const WHO_FILTERS = ['me', 'other', 'both'] as const
export type WhoFilter = (typeof WHO_FILTERS)[number]
export const WHO_FILTER_LABEL: Record<WhoFilter, string> = {
  me: 'わたし',
  other: '相手',
  both: 'ふたり',
}

export function matchesWho(todo: TodoLike, who: WhoFilter | undefined, viewer: string): boolean {
  if (!who) return true
  if (who === 'both') return todo.assignee === null
  if (who === 'me') return todo.assignee === viewer
  return todo.assignee !== null && todo.assignee !== viewer
}

export function filterTodos<T extends TodoLike>(
  todos: readonly T[],
  filter: { list?: string; who?: WhoFilter },
  viewer: string,
): T[] {
  return todos.filter(
    (t) => (!filter.list || t.list === filter.list) && matchesWho(t, filter.who, viewer),
  )
}

/**
 * The countdown tag of an open item: 今日 / 明日 / 明後日 / あとN日 within the week,
 * N日過ぎ when overdue, the date (M/D) further away, null when undated
 */
export function dueLabel(dueOn: string | null, todayKey: string): string | null {
  if (!dueOn) return null
  const days = daysUntil(dueOn, todayKey)
  if (days < 0) return `${-days}日過ぎ`
  if (days === 0) return '今日'
  if (days === 1) return '明日'
  if (days === 2) return '明後日'
  if (days <= WEEK_DAYS) return `あと${days}日`
  const [, month, day] = dueOn.split('-')
  return `${Number(month)}/${Number(day)}`
}

/** The open items worth showing on the home page: overdue, today and this week, soonest first */
export function homeTodos<T extends TodoLike>(
  todos: readonly T[],
  todayKey: string,
  limit: number,
): T[] {
  const g = groupTodos(todos, todayKey)
  return [...g.overdue, ...g.today, ...g.week].slice(0, limit)
}
