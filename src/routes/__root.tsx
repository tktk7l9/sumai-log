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
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'robots', content: 'noindex, nofollow, noarchive' },
      { name: 'theme-color', content: '#ca7654' },
      { title: '住まいログ' },
    ],
    links: [
      { rel: 'stylesheet', href: mantineCoreCss },
      { rel: 'stylesheet', href: mantineDatesCss },
      { rel: 'stylesheet', href: mantineNotificationsCss },
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'apple-touch-icon', href: '/logo192.png' },
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
        <HeadContent />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <DatesProvider settings={{ locale: 'ja', firstDayOfWeek: 0 }}>
            <Notifications position="top-center" />
            <AppLayout>{children}</AppLayout>
          </DatesProvider>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  )
}
