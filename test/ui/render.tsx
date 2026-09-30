/**
 * Render helpers for the UI tests. Every render goes through the same providers as
 * src/routes/__root.tsx (Mantine theme, Japanese dates, notifications).
 */
import { MantineProvider } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { Notifications, notifications } from '@mantine/notifications'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import 'dayjs/locale/ja'
import { StrictMode, type ReactNode } from 'react'

import { routeTree } from '../../src/routeTree.gen'
import { theme } from '../../src/theme'

/** StrictMode as in the app's client entry (TanStack Start's default hydrates inside it) */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider theme={theme} env="test">
        <DatesProvider settings={{ locale: 'ja', firstDayOfWeek: 1, weekendDays: [0, 6] }}>
          <Notifications />
          {children}
        </DatesProvider>
      </MantineProvider>
    </StrictMode>
  )
}

/** Render a component (no router context) */
export function renderUi(ui: ReactNode) {
  const user = userEvent.setup()
  return { user, ...render(<Providers>{ui}</Providers>) }
}

/** Render the whole app at `path` with the real route tree and a memory history */
export async function renderRoute(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingMinMs: 0,
  })
  const user = userEvent.setup()
  const utils = render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  )
  // Wait for the loader and the first paint of the matched route
  await screen.findAllByText('住まいログ')
  return { user, router, ...utils }
}

/**
 * Run the deletes that are waiting for their undo window now. The app does the same on
 * `pagehide` (src/components/undoableDelete.tsx), so no fake clock is needed
 */
export function flushPendingDeletes() {
  window.dispatchEvent(new Event('pagehide'))
}

/** Dismiss every notification (Mantine shows at most 5 and queues the rest) */
export function clearNotifications() {
  act(() => notifications.clean())
}
