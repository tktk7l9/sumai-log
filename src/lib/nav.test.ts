import { describe, expect, it } from 'vitest'

import { NAV_ITEMS, isNavItemActive } from './nav'

describe('isNavItemActive', () => {
  it("'/' is active only on the top page", () => {
    expect(isNavItemActive('/', '/')).toBe(true)
    expect(isNavItemActive('/company', '/')).toBe(false)
  })

  it('is active on an exact match', () => {
    expect(isNavItemActive('/company', '/company')).toBe(true)
  })

  it('is active on a nested path too', () => {
    expect(isNavItemActive('/properties/1', '/properties')).toBe(true)
  })

  it('is not active on a different route that only shares the prefix', () => {
    expect(isNavItemActive('/company-archive', '/company')).toBe(false)
  })
})

describe('NAV_ITEMS', () => {
  it('has 5 tabs, and settings is not one of them', () => {
    expect(NAV_ITEMS.map((i) => i.to)).toEqual([
      '/',
      '/calendar',
      '/records',
      '/candidates',
      '/map',
    ])
  })

  it('selects the "候補" (Candidates) tab on a candidate detail page too', () => {
    expect(isNavItemActive('/candidates/vendors/abc', '/candidates')).toBe(true)
    expect(isNavItemActive('/places/abc', '/map')).toBe(false)
  })
})
