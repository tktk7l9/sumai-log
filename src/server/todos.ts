import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { dateKey } from '../lib/calendar'
import { homeTodos } from '../lib/todos'
import { nowJstIso } from './events'
import { currentActorEmail } from './members'
import {
  deleteTodo as deleteTodoRow,
  listTodos as listTodoRows,
  saveOrConflict,
  setTodoDone as setTodoDoneRow,
  upsertTodo,
} from './repository'
import { todoDoneInput, todoInput } from './todos.schema'
import { idInput } from './zod'

export { todoInput }
export type { TodoInput } from './todos.schema'

/**
 * Every to-do plus "today" and the viewer's e-mail (the 「わたし」/「相手」 chips are resolved
 * on the client against it, so the URL carries no e-mail)
 */
export const listTodos = createServerFn().handler(async () => {
  const [rows, viewer] = await Promise.all([listTodoRows(getDb()), currentActorEmail()])
  const now = nowJstIso()
  return { todos: rows, todayKey: dateKey(now), viewer }
})

export const saveTodo = createServerFn({ method: 'POST' })
  .validator(todoInput)
  .handler(async ({ data }) =>
    saveOrConflict(async () => upsertTodo(getDb(), data, await currentActorEmail())),
  )

/** Tick / untick. `ok: false` when the row was deleted meanwhile */
export const setTodoDone = createServerFn({ method: 'POST' })
  .validator(todoDoneInput)
  .handler(async ({ data }) => {
    const ok = await setTodoDoneRow(
      getDb(),
      data.id,
      data.done ? { at: nowJstIso(), by: await currentActorEmail() } : null,
    )
    return { ok }
  })

export const deleteTodo = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    await deleteTodoRow(getDb(), data.id)
    return { ok: true as const }
  })

/** The home block: overdue, today and this week, at most HOME_TODO_LIMIT (src/lib/todos.ts) */
export const HOME_TODO_LIMIT = 5
export const listHomeTodos = createServerFn().handler(async () => {
  const rows = await listTodoRows(getDb())
  const todayKey = dateKey(nowJstIso())
  return { todos: homeTodos(rows, todayKey, HOME_TODO_LIMIT), todayKey }
})
