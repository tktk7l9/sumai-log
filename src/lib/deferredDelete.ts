/**
 * Deferred deletion: delete without asking and offer "元に戻す" (Undo) instead
 * (SHIG 57 act silently, 54 fail-safe over fool-proof).
 *
 * The server call is held back for UNDO_WINDOW_MS. Undo simply cancels the timer, so nothing
 * on the server has to be restored (no schema change / soft delete). While an id is pending or
 * its commit is in flight it stays in `snapshot()`, and lists hide it, so the row disappears at
 * once and does not flash back before the list is re-read.
 */
export const UNDO_WINDOW_MS = 6000

export type Timer = {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

type Entry = { handle: unknown; commit: () => Promise<unknown> } | { handle: null; commit: null }

export function createDeferredQueue(delayMs: number, timer: Timer) {
  const entries = new Map<string, Entry>()
  const listeners = new Set<() => void>()
  let snapshot: ReadonlySet<string> = new Set()

  function emit() {
    snapshot = new Set(entries.keys())
    listeners.forEach((l) => l())
  }

  function run(id: string, commit: () => Promise<unknown>) {
    // Mark as in flight: still hidden, but no longer cancellable
    entries.set(id, { handle: null, commit: null })
    void commit()
      .catch(() => {})
      .finally(() => {
        entries.delete(id)
        emit()
      })
  }

  return {
    /** Returns false when the id is already pending (a double tap must not delete twice) */
    schedule(id: string, commit: () => Promise<unknown>): boolean {
      if (entries.has(id)) return false
      const handle = timer.set(() => run(id, commit), delayMs)
      entries.set(id, { handle, commit })
      emit()
      return true
    },
    /** Undo. Returns false when there is nothing left to cancel */
    cancel(id: string): boolean {
      const entry = entries.get(id)
      if (!entry || entry.commit === null) return false
      timer.clear(entry.handle)
      entries.delete(id)
      emit()
      return true
    },
    /** Commit everything still waiting now (used when the page is being left) */
    flush() {
      for (const [id, entry] of [...entries]) {
        if (entry.commit === null) continue
        timer.clear(entry.handle)
        run(id, entry.commit)
      }
    },
    snapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
