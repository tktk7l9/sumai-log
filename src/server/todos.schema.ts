import { z } from 'zod'

import { TODO_LISTS } from '../db/schema'
import { dateField, idField, optionalText, optionalUrl } from './zod'

/**
 * Split from todos.ts for the same reason as events.schema.ts: a plain workers test can
 * import this pure zod schema without pulling in the TanStack Start server runtime
 */
export const todoInput = z.object({
  id: idField.optional(),
  // The updated-at at the time of opening; the save returns a conflict instead of
  // overwriting when the other person saved first (repository/stale.ts)
  expectedUpdatedAt: z.string().max(40).nullish(),
  title: z.string().trim().min(1, 'やることを入れてください').max(200),
  list: z.enum(TODO_LISTS),
  // A member e-mail or null = both of them. The screen only offers the configured members
  assignee: z.string().trim().email().max(200).nullable(),
  dueOn: dateField.nullable(),
  url: optionalUrl,
  note: optionalText,
})
export type TodoInput = z.input<typeof todoInput>

export const todoDoneInput = z.object({ id: idField, done: z.boolean() })
