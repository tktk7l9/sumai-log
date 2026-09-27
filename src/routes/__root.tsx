import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { Notifications } from '@mantine/notifications'
import 'dayjs/locale/ja'

import { AppLayout } from '../components/AppLayout'
import { RouteErrorState, RouteNotFoundState } from '../components/ErrorStates'
import { theme } from '../theme'

import mantineCoreCss from '@mantine/core/styles.css?url'
import mantineDatesCss from '@mantine/dates/styles.css?url'
import mantineNotificationsCss from '@mantine/notifications/styles.css?url'
import mantineScheduleCss from '@mantine/schedule/styles.css?url'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        // interactive-widget=resizes-content: when the soft keyboard appears on Android Chrome,
        // shrink the layout viewport itself so the form Drawer that slides up from the bottom
        // is not hidden by the keyboard (iOS Safari ignores it, so FormDrawer watches visualViewport)
        content:
          'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
      },
      { name: 'robots', content: 'noindex, nofollow, noarchive' },
      // theme-color: the 2 tags for light/dark are written directly in the <head> of RootDocument
      // (the meta array of head() merges tags with the same name into 1)
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      { title: '住まいログ' },
    ],
    links: [
      { rel: 'stylesheet', href: mantineCoreCss },
      { rel: 'stylesheet', href: mantineDatesCss },
      { rel: 'stylesheet', href: mantineScheduleCss },
      { rel: 'stylesheet', href: mantineNotificationsCss },
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/apple-touch-icon-180.png' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  shellComponent: RootDocument,
  errorComponent: ({ error }) => <RouteErrorState error={error} />,
  notFoundComponent: RouteNotFoundState,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
        {/* The background colour matches --mantine-color-body in src/styles.css and dark[7] in src/theme.ts */}
        <meta name="theme-color" content="#faf7f2" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#1c1917" media="(prefers-color-scheme: dark)" />
        <HeadContent />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <DatesProvider settings={{ locale: 'ja', firstDayOfWeek: 1, weekendDays: [0, 6] }}>
            <Notifications position="top-center" />
            <AppLayout>{children}</AppLayout>
          </DatesProvider>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  )
}
