/**
 * Reading and writing half-written form input (drafts) (pure functions). Even when the Drawer
 * is closed by tapping outside it, the input can be restored from the draft kept in the
 * device's localStorage. src/components/useFormDraft.ts is what touches localStorage; this
 * file only decides the key, the shape and the expiry.
 */

/**
 * The draft key. kind is the form kind, id is the row being edited ('new' for a new one). For
 * an existing row, context holds the updated-at timestamp at the time it was opened (if the
 * other person saved after that, the key changes, so an old draft does not overwrite their
 * change). For a new row it holds where the form was opened from
 */
export function draftKey(kind: string, id: string | null | undefined, context?: string): string {
  return `sumai-draft:${kind}:${id ?? 'new'}${context ? `:${context}` : ''}`
}

/** How long a draft is kept (days). Anything older is not read */
export const DRAFT_MAX_AGE_DAYS = 14

type Stored<T> = { v: 1; savedAt: number; values: T }

export function serializeDraft<T>(values: T, now: number): string {
  const stored: Stored<T> = { v: 1, savedAt: now, values }
  return JSON.stringify(stored)
}

/** Reads a draft. Returns null when it is broken, old or differently shaped */
export function parseDraft<T>(raw: string | null, now: number): T | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const s = parsed as Partial<Stored<T>>
  if (s.v !== 1 || typeof s.savedAt !== 'number' || s.values === undefined) return null
  if (now - s.savedAt > DRAFT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return null
  return s.values as T
}

/**
 * Whether the values are equal (decides if a draft needs keeping). null, empty string and
 * undefined count as the same
 */
export function sameValues(a: unknown, b: unknown): boolean {
  return JSON.stringify(a, blankToNull) === JSON.stringify(b, blankToNull)
}

function blankToNull(_key: string, value: unknown): unknown {
  return value === '' || value === undefined ? null : value
}
