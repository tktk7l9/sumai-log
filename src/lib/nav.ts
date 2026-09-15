/**
 * ナビゲーションの選択状態。'/' だけは前方一致だと常に一致してしまうため完全一致にする。
 */
export function isNavItemActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}
