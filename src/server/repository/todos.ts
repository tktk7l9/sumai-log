import { and, asc, eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { todos, type NewTodo } from '../../db/schema'
import { assertUpdated } from './stale'

type TodoInput = Omit<
  NewTodo,
  'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'doneAt' | 'doneBy'
> & {
  id?: string
  expectedUpdatedAt?: string | null
}

export async function upsertTodo(db: Db, input: TodoInput, actorEmail: string): Promise<string> {
  const { id, expectedUpdatedAt, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(todos).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  const rows = await db
    .update(todos)
    .set({ ...values, updatedAt: sql`(datetime('now'))` })
    .where(
      expectedUpdatedAt
        ? and(eq(todos.id, id), eq(todos.updatedAt, expectedUpdatedAt))
        : eq(todos.id, id),
    )
    .returning({ id: todos.id })
  assertUpdated(rows, expectedUpdatedAt)
  return id
}

/**
 * Ticks or unticks. No stale check: both of them ticking the same item is not a conflict.
 * Returns false when the row no longer exists
 */
export async function setTodoDone(
  db: Db,
  id: string,
  done: { at: string; by: string } | null,
): Promise<boolean> {
  const rows = await db
    .update(todos)
    .set({
      doneAt: done ? done.at : null,
      doneBy: done ? done.by : null,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(todos.id, id))
    .returning({ id: todos.id })
  return rows.length > 0
}

export async function deleteTodo(db: Db, id: string): Promise<void> {
  await db.delete(todos).where(eq(todos.id, id))
}

/** Every to-do (a household has a few dozen at most; the screen groups and filters them) */
export async function listTodos(db: Db) {
  return db.select().from(todos).orderBy(asc(todos.dueOn), asc(todos.createdAt))
}
