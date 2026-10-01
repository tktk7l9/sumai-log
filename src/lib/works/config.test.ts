import { describe, expect, it } from 'vitest'

import { parseSitesConfig } from './config'

const site = { key: 'siteA', parser: 'siteA', listUrl: 'https://example.com/case/', vendorId: null }

describe('parseSitesConfig', () => {
  it('accepts a list of sites', () => {
    expect(parseSitesConfig({ sites: [site] })).toEqual([site])
  })

  it('defaults a missing vendorId to null', () => {
    const { vendorId: _omit, ...rest } = site
    expect(parseSitesConfig({ sites: [rest] })[0]?.vendorId).toBeNull()
  })

  it.each([
    ['not an object', null],
    ['no sites', {}],
    ['empty sites', { sites: [] }],
    ['unknown parser', { sites: [{ ...site, parser: 'siteZ' }] }],
    ['http list url', { sites: [{ ...site, listUrl: 'http://example.com/' }] }],
    ['empty key', { sites: [{ ...site, key: '' }] }],
    ['duplicate key', { sites: [site, site] }],
    ['non-object site', { sites: ['x'] }],
    ['numeric vendorId', { sites: [{ ...site, vendorId: 1 }] }],
  ])('rejects %s', (_name, input) => {
    expect(() => parseSitesConfig(input)).toThrow(/works-sites\.json/)
  })
})
