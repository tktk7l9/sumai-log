/**
 * Setup for the jsdom UI tests (vitest.ui.config.ts).
 *
 * - Browser APIs that jsdom lacks and Mantine needs (matchMedia, ResizeObserver, ...)
 * - `createServerFn` builds a `vi.fn()` instead of an RPC stub, so importing a server module
 *   never touches D1/R2 and each test decides what a server function returns
 * - The root route is swapped for one without the <html> shell (test/ui/root.tsx)
 */
import '@testing-library/jest-dom/vitest'
import { notifications } from '@mantine/notifications'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

vi.mock('@tanstack/react-start', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-start')>()
  function createServerFn() {
    const builder = {
      validator: () => builder,
      inputValidator: () => builder,
      middleware: () => builder,
      handler: () => vi.fn(async () => undefined),
    }
    return builder
  }
  return { ...actual, createServerFn }
})

vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () => new Request('https://example.test/'),
  getRequestHeader: () => undefined,
}))

vi.mock('../../src/routes/__root', () => import('./root'))

afterEach(() => {
  // Deletes still waiting for their undo window must not leak into the next test
  window.dispatchEvent(new Event('pagehide'))
  cleanup()
  notifications.clean()
  window.localStorage.clear()
  vi.resetAllMocks()
  installMatchMedia()
})

// ---- jsdom gaps -------------------------------------------------------------------------

/** Desktop, mouse, light scheme: no media query matches. Tests may swap it; it is put back after each */
function installMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}
installMatchMedia()

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
class IntersectionObserverStub {
  root = null
  rootMargin = ''
  thresholds = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
Object.assign(globalThis, {
  ResizeObserver: ResizeObserverStub,
  IntersectionObserver: IntersectionObserverStub,
})
window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {}
window.scrollTo = (() => {}) as typeof window.scrollTo
Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: {
    ready: Promise.resolve(),
    addEventListener: () => {},
    removeEventListener: () => {},
  },
})
