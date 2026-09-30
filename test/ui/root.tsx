/**
 * Root route used by the UI tests in place of src/routes/__root.tsx: the same layout and
 * error states, without the <html>/<head> shell that cannot be mounted inside jsdom's body.
 */
import { Outlet, createRootRoute } from '@tanstack/react-router'

import { AppLayout } from '../../src/components/AppLayout'
import { RouteErrorState, RouteNotFoundState } from '../../src/components/ErrorStates'

export const Route = createRootRoute({
  // Like RootDocument, the layout is part of the shell, so it stays around error states too
  shellComponent: ({ children }) => <AppLayout>{children}</AppLayout>,
  component: () => <Outlet />,
  errorComponent: ({ error }) => <RouteErrorState error={error} />,
  notFoundComponent: () => <RouteNotFoundState />,
})
