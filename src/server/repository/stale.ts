/**
 * A mechanism so that when the two people edit the same record at the same time, the one
 * who saves later does not silently overwrite. The form sends the updated_at from when it
 * was opened as expectedUpdatedAt, and the update is done with
 * `WHERE id = ? AND updated_at = ?`. 0 rows means the other person updated (or deleted) it first.
 */
export class StaleWriteError extends Error {
  constructor() {
    super('相手が先に更新しました')
    this.name = 'StaleWriteError'
  }
}

/** StaleWriteError if the update hit 0 rows and an expected update time was passed */
export function assertUpdated(rows: unknown[], expectedUpdatedAt: string | null | undefined): void {
  if (expectedUpdatedAt && rows.length === 0) throw new StaleWriteError()
}

export type SaveResult = { id: string; conflict: false } | { id: null; conflict: true }

/** Runs the save and returns { conflict: true } on a conflict (any other exception is rethrown as is) */
export async function saveOrConflict(run: () => Promise<string>): Promise<SaveResult> {
  try {
    return { id: await run(), conflict: false }
  } catch (e) {
    if (e instanceof StaleWriteError) return { id: null, conflict: true }
    throw e
  }
}
