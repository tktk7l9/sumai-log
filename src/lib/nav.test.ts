import { describe, expect, it } from 'vitest'

import { isNavItemActive } from './nav'

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
