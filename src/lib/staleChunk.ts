/**
 * Recovery from a deploy that happened while the app was open.
 *
 * Every deploy renames the hashed chunks under /assets/. A phone that still has the previous
 * page open asks for the old names on its next navigation, gets 404, and the tap ends in
 * 「表示できませんでした」 (Could not show) although nothing is wrong with the data. Vite
 * announces that failure as a `vite:preloadError` event on window; reloading once fetches the
 * current page and chunks together.
 *
 * Only one reload per window: when the chunks are really unreachable (an outage) the page
 * must not reload forever.
 */

export const STALE_CHUNK_RELOAD_KEY = 'sumai:stale-chunk-reload-at'
export const STALE_CHUNK_RELOAD_WINDOW_MS = 60_000

type EventTargetLike = {
  addEventListener: (type: string, listener: (e: Event) => void) => void
  removeEventListener: (type: string, listener: (e: Event) => void) => void
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** `lastReloadAt` is the stored epoch milliseconds of the previous reload, or null */
export function shouldReloadForStaleChunk(lastReloadAt: string | null, now: number): boolean {
  const last = Number(lastReloadAt)
  if (lastReloadAt === null || lastReloadAt === '' || !Number.isFinite(last)) return true
  return now - last > STALE_CHUNK_RELOAD_WINDOW_MS
}

function readLastReload(storage: StorageLike): string | null {
  try {
    return storage.getItem(STALE_CHUNK_RELOAD_KEY)
  } catch {
    return null
  }
}

function writeLastReload(storage: StorageLike, now: number): void {
  try {
    storage.setItem(STALE_CHUNK_RELOAD_KEY, String(now))
  } catch {
    // Without storage the reload still happens; a loop is prevented only by the window
  }
}

/**
 * Listens for `vite:preloadError` and reloads once. Returns the function that removes the
 * listener. `storage` should survive the reload (sessionStorage).
 */
export function installStaleChunkReload(
  target: EventTargetLike,
  storage: StorageLike,
  reload: () => void,
  now: () => number = Date.now,
): () => void {
  const onPreloadError = (event: Event) => {
    const at = now()
    if (!shouldReloadForStaleChunk(readLastReload(storage), at)) return
    // Prevent Vite from throwing the import error into the router (the page is about to go)
    event.preventDefault()
    writeLastReload(storage, at)
    reload()
  }
  target.addEventListener('vite:preloadError', onPreloadError)
  return () => target.removeEventListener('vite:preloadError', onPreloadError)
}
