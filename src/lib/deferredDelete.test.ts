import { describe, expect, it, vi } from 'vitest'

import { UNDO_WINDOW_MS, createDeferredQueue, hidePendingOnHome } from './deferredDelete'

function fakeTimer() {
  let next = 1
  const timers = new Map<number, () => void>()
  const delays: number[] = []
  return {
    timer: {
      set: (fn: () => void, ms: number) => {
        const id = next++
        timers.set(id, fn)
        delays.push(ms)
        return id
      },
      clear: (handle: unknown) => {
        timers.delete(handle as number)
      },
    },
    fireAll() {
      const fns = [...timers.values()]
      timers.clear()
      fns.forEach((fn) => fn())
    },
    size: () => timers.size,
    delays,
  }
}

describe('createDeferredQueue', () => {
  it('uses an undo window of a few seconds', () => {
    expect(UNDO_WINDOW_MS).toBeGreaterThanOrEqual(5000)
  })

  it('does not commit until the timer fires, and hides the id meanwhile', async () => {
    const t = fakeTimer()
    const q = createDeferredQueue(6000, t.timer)
    const commit = vi.fn(async () => {})
    expect(q.schedule('a', commit)).toBe(true)
    expect(commit).not.toHaveBeenCalled()
    expect(q.snapshot().has('a')).toBe(true)

    t.fireAll()
    expect(commit).toHaveBeenCalledTimes(1)
    // Still hidden while the commit is in flight (no flash of the deleted row)
    expect(q.snapshot().has('a')).toBe(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(q.snapshot().has('a')).toBe(false)
  })

  it('cancel() during the window never commits and shows the id again', () => {
    const t = fakeTimer()
    const q = createDeferredQueue(6000, t.timer)
    const commit = vi.fn(async () => {})
    q.schedule('a', commit)
    expect(q.cancel('a')).toBe(true)
    expect(q.snapshot().has('a')).toBe(false)
    expect(t.size()).toBe(0)
    t.fireAll()
    expect(commit).not.toHaveBeenCalled()
  })

  it('cancel() is refused for an unknown id or once the commit has started', () => {
    const t = fakeTimer()
    const q = createDeferredQueue(6000, t.timer)
    expect(q.cancel('nope')).toBe(false)
    q.schedule('a', () => new Promise(() => {}))
    t.fireAll()
    expect(q.cancel('a')).toBe(false)
  })

  it('ignores a second schedule of the same id', () => {
    const t = fakeTimer()
    const q = createDeferredQueue(6000, t.timer)
    const first = vi.fn(async () => {})
    const second = vi.fn(async () => {})
    expect(q.schedule('a', first)).toBe(true)
    expect(q.schedule('a', second)).toBe(false)
    t.fireAll()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('shows the id again when the commit rejects', async () => {
    const t = fakeTimer()
    const q = createDeferredQueue(6000, t.timer)
    q.schedule('a', async () => {
      throw new Error('boom')
    })
    t.fireAll()
    await Promise.resolve()
    await Promise.resolve()
    expect(q.snapshot().has('a')).toBe(false)
  })

  it('flush() commits everything that is still waiting, at once', () => {
    const t = fakeTimer()
    const q = createDeferredQueue(6000, t.timer)
    const a = vi.fn(async () => {})
    const b = vi.fn(async () => {})
    q.schedule('a', a)
    q.schedule('b', b)
    q.flush()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    expect(t.size()).toBe(0)
  })

  it('flush() does not commit an id whose commit is already in flight a second time', () => {
    const t = fakeTimer()
    const q = createDeferredQueue(6000, t.timer)
    const a = vi.fn(() => new Promise(() => {}))
    q.schedule('a', a)
    t.fireAll()
    q.flush()
    expect(a).toHaveBeenCalledTimes(1)
  })

  it('notifies subscribers on every change and stops after unsubscribe', () => {
    const t = fakeTimer()
    const q = createDeferredQueue(6000, t.timer)
    const listener = vi.fn()
    const off = q.subscribe(listener)
    q.schedule('a', async () => {})
    q.cancel('a')
    expect(listener).toHaveBeenCalledTimes(2)
    off()
    q.schedule('b', async () => {})
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('keeps the same snapshot object while nothing changes (stable for useSyncExternalStore)', () => {
    const t = fakeTimer()
    const q = createDeferredQueue(6000, t.timer)
    expect(q.snapshot()).toBe(q.snapshot())
    q.schedule('a', async () => {})
    const s = q.snapshot()
    expect(q.snapshot()).toBe(s)
  })

  describe('pause() / resume() (the notification is hovered or focused, SHIG 54)', () => {
    it('pause() stops the timer but keeps the id hidden and undoable', () => {
      const t = fakeTimer()
      const q = createDeferredQueue(6000, t.timer)
      const commit = vi.fn(async () => {})
      q.schedule('a', commit)
      expect(q.pause('a')).toBe(true)
      expect(t.size()).toBe(0)
      t.fireAll()
      expect(commit).not.toHaveBeenCalled()
      expect(q.snapshot().has('a')).toBe(true)
      expect(q.cancel('a')).toBe(true)
      expect(commit).not.toHaveBeenCalled()
    })

    it('resume() starts a whole new window, so the user gets the full time again', () => {
      const t = fakeTimer()
      const q = createDeferredQueue(6000, t.timer)
      const commit = vi.fn(async () => {})
      q.schedule('a', commit)
      q.pause('a')
      expect(q.resume('a')).toBe(true)
      expect(t.size()).toBe(1)
      expect(t.delays).toEqual([6000, 6000])
      t.fireAll()
      expect(commit).toHaveBeenCalledTimes(1)
    })

    it('pause() twice keeps one paused entry, and resume() twice starts only one timer', () => {
      const t = fakeTimer()
      const q = createDeferredQueue(6000, t.timer)
      q.schedule('a', async () => {})
      expect(q.pause('a')).toBe(true)
      expect(q.pause('a')).toBe(false)
      expect(q.resume('a')).toBe(true)
      expect(q.resume('a')).toBe(false)
      expect(t.size()).toBe(1)
    })

    it('refuses unknown ids and ids whose commit is already in flight', () => {
      const t = fakeTimer()
      const q = createDeferredQueue(6000, t.timer)
      expect(q.pause('nope')).toBe(false)
      expect(q.resume('nope')).toBe(false)
      q.schedule('a', () => new Promise(() => {}))
      t.fireAll()
      expect(q.pause('a')).toBe(false)
      expect(q.resume('a')).toBe(false)
    })

    it('resume() of a running (not paused) id does not add a second timer', () => {
      const t = fakeTimer()
      const q = createDeferredQueue(6000, t.timer)
      q.schedule('a', async () => {})
      expect(q.resume('a')).toBe(false)
      expect(t.size()).toBe(1)
    })

    it('flush() still commits a paused id (leaving the page must not lose the delete)', () => {
      const t = fakeTimer()
      const q = createDeferredQueue(6000, t.timer)
      const commit = vi.fn(async () => {})
      q.schedule('a', commit)
      q.pause('a')
      q.flush()
      expect(commit).toHaveBeenCalledTimes(1)
    })

    it('does not notify subscribers on pause/resume (the hidden set does not change)', () => {
      const t = fakeTimer()
      const q = createDeferredQueue(6000, t.timer)
      q.schedule('a', async () => {})
      const listener = vi.fn()
      q.subscribe(listener)
      q.pause('a')
      q.resume('a')
      expect(listener).not.toHaveBeenCalled()
    })
  })
})

describe('hidePendingOnHome', () => {
  const data = {
    agenda: [{ id: 'e1' }, { id: 'e2' }],
    pending: [{ id: 'e1' }, { id: 'e3' }],
    news: [
      { id: 'n1', vendorId: 'v1' },
      { id: 'n2', vendorId: 'v2' },
    ],
    feed: [{ id: 'visit1' }, { id: 'v1' }, { id: 'c1' }],
    other: 'kept',
  }

  it('returns the same data when nothing is pending', () => {
    expect(hidePendingOnHome(data, new Set())).toBe(data)
  })

  it('hides pending events, feed items, and the news of a vendor being deleted', () => {
    const out = hidePendingOnHome(data, new Set(['e1', 'v1', 'c1']))
    expect(out.agenda.map((e) => e.id)).toEqual(['e2'])
    expect(out.pending.map((e) => e.id)).toEqual(['e3'])
    expect(out.news.map((n) => n.id)).toEqual(['n2'])
    expect(out.feed.map((f) => f.id)).toEqual(['visit1'])
    expect(out.other).toBe('kept')
  })
})
