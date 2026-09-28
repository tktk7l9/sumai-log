/**
 * Selected state of the navigation. Only '/' uses an exact match, because a prefix match would
 * always match it.
 */
export function isNavItemActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}

/**
 * Tab definitions shared by the bottom tabs (phone) and the left nav (desktop).
 * "設定" (Settings) is not a tab; it is a separate link in the header (on the AppLayout side).
 */
export const NAV_ITEMS = [
  { to: '/', label: 'ホーム', icon: 'home' },
  { to: '/calendar', label: '予定', icon: 'calendar' },
  { to: '/records', label: '記録', icon: 'notebook' },
  { to: '/candidates', label: '候補', icon: 'building' },
  { to: '/map', label: '地図', icon: 'map' },
] as const
export type NavIcon = (typeof NAV_ITEMS)[number]['icon']
