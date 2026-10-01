import {
  ActionIcon,
  AppShell,
  Group,
  Menu,
  NavLink,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { Link, useLocation } from '@tanstack/react-router'
import {
  BookOpen,
  ChartColumn,
  Building2,
  CalendarDays,
  Ellipsis,
  House,
  Images,
  LandPlot,
  Map,
  Newspaper,
  NotebookPen,
  Radio,
  Settings,
} from 'lucide-react'

import { NAV_ITEMS, isNavItemActive, type NavIcon } from '../lib/nav'
import { PullToRefresh } from './PullToRefresh'

/** Links on the right side of the header (pages not in the bottom tabs). Listed in display order */
const HEADER_LINKS = [
  { to: '/news', label: 'お知らせ', Icon: Newspaper },
  { to: '/glossary', label: '用語集', Icon: BookOpen },
  { to: '/sources', label: '情報収集', Icon: Radio },
  { to: '/works', label: '施工例', Icon: Images },
  { to: '/site', label: '区画', Icon: LandPlot },
  { to: '/analysis', label: '分析', Icon: ChartColumn },
  { to: '/settings', label: '設定', Icon: Settings },
] as const

const ICONS: Record<NavIcon, typeof House> = {
  home: House,
  calendar: CalendarDays,
  notebook: NotebookPen,
  building: Building2,
  map: Map,
}

/**
 * Phone: a small header on top, a tab bar at the bottom. Desktop (sm and up): left nav.
 * Both use the same NAV_ITEMS. The add action is handled by each page's FAB.
 */
export function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()

  return (
    <AppShell
      header={{ height: 52 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: true } }}
      footer={{ height: { base: 56, sm: 0 } }}
      padding="md"
    >
      <AppShell.Header className="appbar">
        <Group h="100%" px="md" justify="space-between" wrap="nowrap" gap="xs">
          <Text
            fw={700}
            size="lg"
            component={Link}
            to="/"
            c="inherit"
            td="none"
            style={{ whiteSpace: 'nowrap' }}
          >
            住まいログ
          </Text>
          {/* Phone width (below sm): 6 unlabeled icons in a row are hard to understand and
              are too many entry points (SHIG 17, 31). Only the frequently used
              "お知らせ" (vendor news) stays as an icon, and the rest go into a labeled menu */}
          <Group gap={4} wrap="nowrap" hiddenFrom="sm">
            {HEADER_LINKS.filter(({ to }) => to === '/news').map(({ to, label, Icon }) => {
              const active = isNavItemActive(pathname, to)
              return (
                <ActionIcon
                  key={to}
                  component={Link}
                  to={to}
                  variant={active ? 'light' : 'subtle'}
                  color={active ? 'clay' : 'gray'}
                  size="lg"
                  aria-label={label}
                  title={label}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={20} aria-hidden />
                </ActionIcon>
              )
            })}
            <MoreMenu pathname={pathname} />
          </Group>
          <Group gap="xs" wrap="nowrap" visibleFrom="sm">
            {HEADER_LINKS.map(({ to, label, Icon }) => {
              const active = isNavItemActive(pathname, to)
              return (
                <NavLink
                  key={to}
                  component={Link}
                  to={to}
                  label={label}
                  leftSection={<Icon size={18} aria-hidden />}
                  active={active}
                  aria-current={active ? 'page' : undefined}
                  w="auto"
                  px="xs"
                />
              )
            })}
          </Group>
        </Group>
      </AppShell.Header>

      {/* visibleFrom: on phones the collapsed navbar is only moved off screen, so its links
          stayed in the Tab order as invisible stops before the page content (SHIG 42) */}
      <AppShell.Navbar className="appbar" p="xs" visibleFrom="sm">
        {NAV_ITEMS.map(({ to, label, icon }) => {
          const Icon = ICONS[icon]
          const active = isNavItemActive(pathname, to)
          return (
            <NavLink
              key={to}
              component={Link}
              to={to}
              label={label}
              leftSection={<Icon size={18} aria-hidden />}
              active={active}
              aria-current={active ? 'page' : undefined}
            />
          )
        })}
      </AppShell.Navbar>

      <AppShell.Main className="app-main">
        <PullToRefresh>{children}</PullToRefresh>
      </AppShell.Main>

      {/* The bottom tabs are 56px. The home indicator part is added by padding-bottom of
          .tabbar, so the content uses h="100%" to fit in the remaining height */}
      <AppShell.Footer hiddenFrom="sm" className="tabbar" withBorder>
        <Group grow gap={0} h="100%" component="nav" aria-label="主要なページ">
          {NAV_ITEMS.map(({ to, label, icon }) => {
            const Icon = ICONS[icon]
            const active = isNavItemActive(pathname, to)
            return (
              <UnstyledButton
                key={to}
                component={Link}
                to={to}
                aria-current={active ? 'page' : undefined}
                h="100%"
                c={active ? 'clay' : 'dimmed'}
              >
                {/* The selected tab is shown not only by color but also by stroke width and
                    font weight */}
                <Stack align="center" justify="center" gap={3} h="100%">
                  <Icon size={20} aria-hidden strokeWidth={active ? 2.5 : 1.75} />
                  <Text size="xs" fw={active ? 700 : 500} lh={1}>
                    {label}
                  </Text>
                </Stack>
              </UnstyledButton>
            )
          })}
        </Group>
      </AppShell.Footer>
    </AppShell>
  )
}

/**
 * "その他" (More) at the right end of the phone header. Lists, with names, the pages that are in
 * neither the bottom tabs nor the header
 */
function MoreMenu({ pathname }: { pathname: string }) {
  const items = HEADER_LINKS.filter(({ to }) => to !== '/news')
  const active = items.some(({ to }) => isNavItemActive(pathname, to))
  return (
    // Not portalled: rendered inside the header, the page links stay within the banner
    // landmark instead of floating outside every landmark
    <Menu position="bottom-end" shadow="md" width={200} withinPortal={false}>
      <Menu.Target>
        <ActionIcon
          variant={active ? 'light' : 'subtle'}
          color={active ? 'clay' : 'gray'}
          size="lg"
          aria-label="その他のページ"
          title="その他"
        >
          <Ellipsis size={20} aria-hidden />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {items.map(({ to, label, Icon }) => {
          const current = isNavItemActive(pathname, to)
          return (
            <Menu.Item
              key={to}
              component={Link}
              to={to}
              leftSection={<Icon size={18} aria-hidden />}
              aria-current={current ? 'page' : undefined}
              fw={current ? 700 : undefined}
            >
              {label}
            </Menu.Item>
          )
        })}
      </Menu.Dropdown>
    </Menu>
  )
}
