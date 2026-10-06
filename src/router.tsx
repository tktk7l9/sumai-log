import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Loader data stays fresh for 30 s: a tab tapped on the phone (touchstart preloads, the
    // tap navigates) runs its loader once, not twice, and going back shows the page at once.
    // Every write calls router.invalidate() and 引っ張って更新 (pull to refresh) does the same,
    // so a change by the other person is at most 30 s away (2026-10-06, measured: the old
    // preloadStaleTime 0 doubled the server function calls)
    defaultStaleTime: 30_000,
    defaultPreloadStaleTime: 30_000,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
