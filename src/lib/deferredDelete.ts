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

/**
 * waiting: the timer runs. paused: the notification is hovered or focused, no timer.
 * running: the commit is in flight, no longer cancellable
 */
type Entry =
  | { state: 'waiting'; handle: unknown; commit: () => Promise<unknown> }
  | { state: 'paused'; commit: () => Promise<unknown> }
  | { state: 'running' }

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
    entries.set(id, { state: 'running' })
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
      entries.set(id, { state: 'waiting', handle, commit })
      emit()
      return true
    },
    /**
     * Stop the clock while the user is looking at or has focused the notification (SHIG 54).
     * The id stays hidden and undoable. Returns false when there is no running timer
     */
    pause(id: string): boolean {
      const entry = entries.get(id)
      if (!entry || entry.state !== 'waiting') return false
      timer.clear(entry.handle)
      entries.set(id, { state: 'paused', commit: entry.commit })
      return true
    },
    /**
     * Restart the clock with a whole new window (the same as Mantine's notifications do after a
     * hover), so the user always gets the full time to decide. Returns false unless paused
     */
    resume(id: string): boolean {
      const entry = entries.get(id)
      if (!entry || entry.state !== 'paused') return false
      const commit = entry.commit
      const handle = timer.set(() => run(id, commit), delayMs)
      entries.set(id, { state: 'waiting', handle, commit })
      return true
    },
    /** Undo. Returns false when there is nothing left to cancel */
    cancel(id: string): boolean {
      const entry = entries.get(id)
      if (!entry || entry.state === 'running') return false
      if (entry.state === 'waiting') timer.clear(entry.handle)
      entries.delete(id)
      emit()
      return true
    },
    /** Commit everything still waiting now (used when the page is being left) */
    flush() {
      for (const [id, entry] of [...entries]) {
        if (entry.state === 'running') continue
        if (entry.state === 'waiting') timer.clear(entry.handle)
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

/**
 * The home screen's data without what is being deleted, the same as the lists hide it:
 * events (agenda and "記録を書きませんか"), recent-feed items, and the vendor news of a vendor
 * being deleted. Returns the input as is when nothing is pending
 */
export function hidePendingOnHome<
  T extends {
    agenda: readonly { id: string }[]
    pending: readonly { id: string }[]
    news: readonly { vendorId: string | null }[]
    feed: readonly { id: string }[]
  },
>(data: T, pendingIds: ReadonlySet<string>): T {
  if (pendingIds.size === 0) return data
  const keep = (item: { id: string }) => !pendingIds.has(item.id)
  return {
    ...data,
    agenda: data.agenda.filter(keep),
    pending: data.pending.filter(keep),
    news: data.news.filter((n) => n.vendorId === null || !pendingIds.has(n.vendorId)),
    feed: data.feed.filter(keep),
  }
}
