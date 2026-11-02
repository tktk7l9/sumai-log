import { describe, expect, it } from 'vitest'

import { todoDoneInput, todoInput } from './todos.schema'

const base = {
  title: '鍵の受け取り',
  list: 'move',
  assignee: null,
  dueOn: null,
  url: null,
  note: null,
}

describe('todoInput', () => {
  it('accepts a bare title and normalises blanks to null', () => {
    const r = todoInput.safeParse({ ...base, title: '  鍵の受け取り ', url: '', note: '' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.title).toBe('鍵の受け取り')
      expect(r.data.url).toBeNull()
      expect(r.data.note).toBeNull()
      expect(r.data.assignee).toBeNull()
    }
  })

  it('rejects an empty title, an unknown list, a bad date, a non-http url and a malformed e-mail', () => {
    expect(todoInput.safeParse({ ...base, title: '   ' }).success).toBe(false)
    expect(todoInput.safeParse({ ...base, list: 'garden' }).success).toBe(false)
    expect(todoInput.safeParse({ ...base, dueOn: '2030/01/05' }).success).toBe(false)
    expect(todoInput.safeParse({ ...base, url: 'ftp://example.com' }).success).toBe(false)
    expect(todoInput.safeParse({ ...base, assignee: 'not-an-email' }).success).toBe(false)
    expect(
      todoInput.safeParse({
        ...base,
        assignee: 'partner@example.com',
        dueOn: '2030-01-05',
        url: 'https://example.com/x',
      }).success,
    ).toBe(true)
  })

  it('todoDoneInput needs a uuid-shaped id and a boolean', () => {
    expect(todoDoneInput.safeParse({ id: 'x', done: true }).success).toBe(false)
    expect(
      todoDoneInput.safeParse({ id: '00000000-0000-4000-8000-000000000001', done: false }).success,
    ).toBe(true)
  })
})
