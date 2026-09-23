import { ActionIcon, AppShell, Group, NavLink, Stack, Text, UnstyledButton } from '@mantine/core'
import { Link, useLocation } from '@tanstack/react-router'
import {
  BookOpen,
  Building2,
  CalendarDays,
  House,
  LandPlot,
  Map,
  Newspaper,
  NotebookPen,
  Radio,
  Settings,
} from 'lucide-react'

import { NAV_ITEMS, isNavItemActive, type NavIcon } from '../lib/nav'
import { PullToRefresh } from './PullToRefresh'

/** ヘッダ右側のリンク（下タブに無いページ）。並びは表示順 */
const HEADER_LINKS = [
  { to: '/news', label: 'お知らせ', Icon: Newspaper },
  { to: '/glossary', label: '用語集', Icon: BookOpen },
  { to: '/sources', label: '情報収集', Icon: Radio },
  { to: '/site', label: '区画', Icon: LandPlot },
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
 * スマホ: 上に小さなヘッダ、下にタブバー。デスクトップ(sm 以上): 左ナビ。
 * 同じ NAV_ITEMS を両方で使う。追加操作は各ページの FAB が担う。
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
          {/* スマホ幅（sm 未満）は 3 つ並ぶと題名が折り返すので、アイコンだけにする。
              ラベルは aria-label と title で残す */}
          <Group gap={4} wrap="nowrap" hiddenFrom="sm">
            {HEADER_LINKS.map(({ to, label, Icon }) => {
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

      <AppShell.Navbar className="appbar" p="xs">
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

      {/* 下タブは 56px。ホームインジケータ分は .tabbar の padding-bottom で足すので、
          中身は h="100%" にして残りの高さに収める */}
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
                {/* 選択中は色だけでなく線の太さと字の太さでも分かるようにする */}
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
