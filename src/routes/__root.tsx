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
        // interactive-widget=resizes-content: Android Chrome でソフトキーボードが出たとき
        // レイアウトビューポート自体を縮めて、下から出るフォーム Drawer がキーボードに
        // 隠れないようにする（iOS Safari は無視するので FormDrawer 側で visualViewport を見る）
        content:
          'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
      },
      { name: 'robots', content: 'noindex, nofollow, noarchive' },
      // theme-color はライト/ダーク 2 本を RootDocument の <head> に直接書く
      // （head() の meta 配列は name が同じタグを 1 本にまとめてしまうため）
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
        {/* 地色は src/styles.css の --mantine-color-body と src/theme.ts の dark[7] に合わせる */}
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
