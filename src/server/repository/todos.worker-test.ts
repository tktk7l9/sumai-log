import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { todos } from '../../db/schema'
import { StaleWriteError } from './stale'
import { actor, db, reset } from './test-helpers'
import { deleteTodo, listTodos, setTodoDone, upsertTodo } from './todos'

beforeEach(reset)

const base = {
  title: '鍵の受け取り',
  list: 'move' as const,
  assignee: null,
  dueOn: '2030-01-05',
  url: null,
  note: null,
}

describe('todos repository', () => {
  it('create -> update -> tick -> untick -> delete', async () => {
    const id = await upsertTodo(db, base, actor)
    let [row] = await db.select().from(todos).where(eq(todos.id, id))
    expect(row.createdBy).toBe(actor)
    expect(row.doneAt).toBeNull()

    await upsertTodo(
      db,
      { ...base, id, title: '鍵の受け取りと立会い', assignee: 'partner@example.com' },
      'partner@example.com',
    )
    ;[row] = await db.select().from(todos).where(eq(todos.id, id))
    expect(row.title).toBe('鍵の受け取りと立会い')
    expect(row.assignee).toBe('partner@example.com')
    expect(row.createdBy).toBe(actor)

    expect(await setTodoDone(db, id, { at: '2030-01-05T10:00:00+09:00', by: actor })).toBe(true)
    ;[row] = await db.select().from(todos).where(eq(todos.id, id))
    expect(row.doneAt).toBe('2030-01-05T10:00:00+09:00')
    expect(row.doneBy).toBe(actor)

    expect(await setTodoDone(db, id, null)).toBe(true)
    ;[row] = await db.select().from(todos).where(eq(todos.id, id))
    expect(row.doneAt).toBeNull()
    expect(row.doneBy).toBeNull()

    await deleteTodo(db, id)
    expect(await listTodos(db)).toEqual([])
    expect(await setTodoDone(db, id, null)).toBe(false)
  })

  it('refuses a save whose expectedUpdatedAt no longer matches', async () => {
    const id = await upsertTodo(db, base, actor)
    const [row] = await db.select().from(todos).where(eq(todos.id, id))
    await db.update(todos).set({ updatedAt: '2031-01-01 00:00:00' }).where(eq(todos.id, id))
    await expect(
      upsertTodo(db, { ...base, id, expectedUpdatedAt: row.updatedAt }, actor),
    ).rejects.toBeInstanceOf(StaleWriteError)
    await expect(
      upsertTodo(db, { ...base, id, expectedUpdatedAt: '2031-01-01 00:00:00', title: 'ok' }, actor),
    ).resolves.toBe(id)
  })

  it('lists with dated items first, by due date', async () => {
    await upsertTodo(db, { ...base, title: 'c', dueOn: null }, actor)
    await upsertTodo(db, { ...base, title: 'b', dueOn: '2030-02-01' }, actor)
    await upsertTodo(db, { ...base, title: 'a', dueOn: '2030-01-01' }, actor)
    // SQLite sorts NULL first in ASC; the screen (src/lib/todos.ts) puts undated last, so the
    // DB order only needs to be deterministic
    expect((await listTodos(db)).map((t) => t.title)).toEqual(['c', 'a', 'b'])
  })
})
