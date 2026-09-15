import { describe, expect, it } from 'vitest'

import { NAV_ITEMS, isNavItemActive } from './nav'

describe('isNavItemActive', () => {
  it("'/' はトップだけで有効になる", () => {
    expect(isNavItemActive('/', '/')).toBe(true)
    expect(isNavItemActive('/company', '/')).toBe(false)
  })

  it('完全一致で有効になる', () => {
    expect(isNavItemActive('/company', '/company')).toBe(true)
  })

  it('配下のパスでも有効になる', () => {
    expect(isNavItemActive('/properties/1', '/properties')).toBe(true)
  })

  it('接頭辞が同じだけの別ルートは有効にしない', () => {
    expect(isNavItemActive('/company-archive', '/company')).toBe(false)
  })
})

describe('NAV_ITEMS', () => {
  it('タブは 5 つで、設定はタブに含めない', () => {
    expect(NAV_ITEMS.map((i) => i.to)).toEqual([
      '/',
      '/calendar',
      '/records',
      '/candidates',
      '/map',
    ])
  })

  it('候補の詳細ページでも「候補」タブが選択される', () => {
    expect(isNavItemActive('/candidates/vendors/abc', '/candidates')).toBe(true)
    expect(isNavItemActive('/places/abc', '/map')).toBe(false)
  })
})
