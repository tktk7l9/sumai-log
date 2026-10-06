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
 * 「動画」 (the vendors' channel videos, /works) took the place of 「地図」 (Map) on
 * 2026-10-06: watching and marking those videos is what the app is used for most (43 marks and
 * 35 memos a week against 11 places), and it sat two taps away in the 「…」 menu (SHIG 20)
 */
export const NAV_ITEMS = [
  { to: '/', label: 'ホーム', icon: 'home' },
  { to: '/calendar', label: '予定', icon: 'calendar' },
  { to: '/records', label: '記録', icon: 'notebook' },
  { to: '/candidates', label: '候補', icon: 'building' },
  { to: '/works', label: '動画', icon: 'video' },
] as const
export type NavIcon = (typeof NAV_ITEMS)[number]['icon']
