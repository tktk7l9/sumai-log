import { AppShell, Group, NavLink, Stack, Text, UnstyledButton } from '@mantine/core'
import { Link, useLocation } from '@tanstack/react-router'
import { Building2, CalendarDays, House, Map, NotebookPen, Settings } from 'lucide-react'

import { NAV_ITEMS, isNavItemActive, type NavIcon } from '../lib/nav'
import { ColorSchemeToggle } from './ColorSchemeToggle'

const ICONS: Record<NavIcon, typeof House> = {
  home: House,
  calendar: CalendarDays,
  notebook: NotebookPen,
  building: Building2,
  map: Map,
}

/**
 * スマホ: 上に小さなヘッダ、下にタブバー。デスクトップ(sm 以上): 左ナビ。
 * 同じ NAV_ITEMS を両方で使う。追加操作は各ページの FAB が担う。
 */
export function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()

  return (
    <AppShell
      header={{ height: 52 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: true } }}
      footer={{ height: { base: 64, sm: 0 } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Text fw={700} size="lg" component={Link} to="/" c="inherit" td="none">
            住まいログ
          </Text>
          <Group gap="xs" wrap="nowrap">
            <ColorSchemeToggle />
            <NavLink
              component={Link}
              to="/settings"
              label="設定"
              leftSection={<Settings size={18} aria-hidden />}
              active={isNavItemActive(pathname, '/settings')}
              w="auto"
              px="xs"
            />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {NAV_ITEMS.map(({ to, label, icon }) => {
          const Icon = ICONS[icon]
          return (
            <NavLink
              key={to}
              component={Link}
              to={to}
              label={label}
              leftSection={<Icon size={18} aria-hidden />}
              active={isNavItemActive(pathname, to)}
            />
          )
        })}
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>

      <AppShell.Footer hiddenFrom="sm" className="tabbar" withBorder>
        <Group grow gap={0} h={64} component="nav" aria-label="主要なページ">
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
              >
                <Stack align="center" justify="center" gap={2} h="100%">
                  <Icon size={22} aria-hidden strokeWidth={active ? 2.5 : 1.75} />
                  <Text size="xs" fw={active ? 700 : 500} c={active ? 'clay' : 'dimmed'}>
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
