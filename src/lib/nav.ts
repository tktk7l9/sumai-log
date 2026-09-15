/**
 * ナビゲーションの選択状態。'/' だけは前方一致だと常に一致してしまうため完全一致にする。
 */
export function isNavItemActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}

/**
 * 下タブ（スマホ）と左ナビ（デスクトップ）で共有するタブ定義。
 * 「設定」はタブに含めず、ヘッダの個別リンクとして扱う（AppLayout 側）。
 */
export const NAV_ITEMS = [
  { to: '/', label: 'ホーム', icon: 'home' },
  { to: '/calendar', label: '予定', icon: 'calendar' },
  { to: '/records', label: '記録', icon: 'notebook' },
  { to: '/candidates', label: '候補', icon: 'building' },
  { to: '/map', label: '地図', icon: 'map' },
] as const
export type NavIcon = (typeof NAV_ITEMS)[number]['icon']
