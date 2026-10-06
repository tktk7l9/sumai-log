import { describe, expect, it, vi } from 'vitest'

import {
  STALE_CHUNK_RELOAD_KEY,
  STALE_CHUNK_RELOAD_WINDOW_MS,
  installStaleChunkReload,
  shouldReloadForStaleChunk,
} from './staleChunk'

const NOW = 1_800_000_000_000

describe('shouldReloadForStaleChunk', () => {
  it('reloads when the page has never reloaded for this reason', () => {
    expect(shouldReloadForStaleChunk(null, NOW)).toBe(true)
  })

  it('reloads again once the previous reload is older than the window', () => {
    const before = String(NOW - STALE_CHUNK_RELOAD_WINDOW_MS - 1)
    expect(shouldReloadForStaleChunk(before, NOW)).toBe(true)
  })

  it('does not reload twice inside the window (a real outage must not loop)', () => {
    expect(shouldReloadForStaleChunk(String(NOW - 1000), NOW)).toBe(false)
    expect(shouldReloadForStaleChunk(String(NOW), NOW)).toBe(false)
  })

  it('treats a broken stored value as never reloaded', () => {
    expect(shouldReloadForStaleChunk('not a number', NOW)).toBe(true)
    expect(shouldReloadForStaleChunk('', NOW)).toBe(true)
  })
})

function fakeWindow() {
  const listeners = new Map<string, Set<(e: Event) => void>>()
  return {
    addEventListener: vi.fn((type: string, listener: (e: Event) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    }),
    removeEventListener: vi.fn((type: string, listener: (e: Event) => void) => {
      listeners.get(type)?.delete(listener)
    }),
    dispatch(type: string) {
      const event = new Event(type, { cancelable: true })
      for (const l of listeners.get(type) ?? []) l(event)
      return event
    },
  }
}

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    store,
  }
}

describe('installStaleChunkReload', () => {
  it('reloads once on vite:preloadError and remembers when it did', () => {
    const win = fakeWindow()
    const storage = fakeStorage()
    const reload = vi.fn()
    installStaleChunkReload(win, storage, reload, () => NOW)

    const event = win.dispatch('vite:preloadError')

    expect(reload).toHaveBeenCalledTimes(1)
    // Prevented, so Vite does not throw the chunk error into the router before the reload
    expect(event.defaultPrevented).toBe(true)
    expect(storage.store.get(STALE_CHUNK_RELOAD_KEY)).toBe(String(NOW))
  })

  it('lets the error through when it already reloaded a moment ago', () => {
    const win = fakeWindow()
    const storage = fakeStorage({ [STALE_CHUNK_RELOAD_KEY]: String(NOW - 5000) })
    const reload = vi.fn()
    installStaleChunkReload(win, storage, reload, () => NOW)

    const event = win.dispatch('vite:preloadError')

    expect(reload).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('returns a function that removes the listener', () => {
    const win = fakeWindow()
    const reload = vi.fn()
    const uninstall = installStaleChunkReload(win, fakeStorage(), reload, () => NOW)

    uninstall()
    win.dispatch('vite:preloadError')

    expect(reload).not.toHaveBeenCalled()
    expect(win.removeEventListener).toHaveBeenCalledWith('vite:preloadError', expect.any(Function))
  })

  it('survives a storage that throws (private mode, blocked site data)', () => {
    const win = fakeWindow()
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const reload = vi.fn()
    installStaleChunkReload(win, broken, reload, () => NOW)

    win.dispatch('vite:preloadError')

    expect(reload).toHaveBeenCalledTimes(1)
  })
})
