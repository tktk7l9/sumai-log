import { describe, expect, it } from 'vitest'

import {
  domainMatches,
  domainOf,
  matchVendorByDomain,
  normalizeDomains,
  splitDomains,
} from './match'

describe('normalizeDomains', () => {
  it('lowercases, removes whitespace, keeps only the right of @, removes duplicates. Empty gives null', () => {
    expect(normalizeDomains(' A.com, @Mail.B.com ,info@c.com,a.com ')).toBe(
      'a.com,mail.b.com,c.com',
    )
    expect(normalizeDomains('')).toBeNull()
    expect(normalizeDomains(' , ')).toBeNull()
    expect(normalizeDomains(null)).toBeNull()
    expect(normalizeDomains(undefined)).toBeNull()
  })
  it('also accepts newline separators', () => {
    expect(normalizeDomains('a.com\nb.com')).toBe('a.com,b.com')
  })
  it('accepts the Japanese comma, spaces and full-width characters as separators', () => {
    expect(normalizeDomains('example.com、mail.example.jp')).toBe('example.com,mail.example.jp')
    expect(normalizeDomains('example.com example.jp　example.net')).toBe(
      'example.com,example.jp,example.net',
    )
    expect(normalizeDomains('Ｅｘａｍｐｌｅ．ｃｏｍ，example.jp')).toBe('example.com,example.jp')
  })
  it('takes the host out of a pasted URL', () => {
    expect(normalizeDomains('https://www.example.com/contact?x=1')).toBe('www.example.com')
    expect(normalizeDomains('http://example.jp:8080/ , example.net/path')).toBe(
      'example.jp,example.net',
    )
  })
})

describe('splitDomains', () => {
  it('turns comma-separated values into an array. null gives empty', () => {
    expect(splitDomains('a.com,b.com')).toEqual(['a.com', 'b.com'])
    expect(splitDomains(null)).toEqual([])
    expect(splitDomains('')).toEqual([])
  })
})

describe('domainOf', () => {
  it('absorbs a display name, uppercase and whitespace', () => {
    expect(domainOf('Some One <Some@Example.COM>')).toBe('example.com')
    expect(domainOf('  x@y.com ')).toBe('y.com')
  })
  it('returns null when there is no @ or it is empty', () => {
    expect(domainOf('nobody')).toBeNull()
    expect(domainOf('')).toBeNull()
    expect(domainOf('x@')).toBeNull()
  })
})

describe('domainMatches', () => {
  it('matches only an exact match and subdomains', () => {
    expect(domainMatches('example.com', 'example.com')).toBe(true)
    expect(domainMatches('mail.example.com', 'example.com')).toBe(true)
    expect(domainMatches('notexample.com', 'example.com')).toBe(false)
    expect(domainMatches('example.com', 'mail.example.com')).toBe(false)
  })
})

describe('matchVendorByDomain', () => {
  const vendors = [
    { id: 'a', newsEmailDomain: 'a.com,news.a.jp' },
    { id: 'b', newsEmailDomain: null },
    { id: 'c', newsEmailDomain: 'c.com' },
  ]
  it('returns the first vendor that matches', () => {
    expect(matchVendorByDomain('x@mail.news.a.jp', vendors)?.id).toBe('a')
    expect(matchVendorByDomain('Y <y@C.com>', vendors)?.id).toBe('c')
  })
  it('returns null when nothing matches or the sender is unreadable', () => {
    expect(matchVendorByDomain('x@d.com', vendors)).toBeNull()
    expect(matchVendorByDomain('broken', vendors)).toBeNull()
  })
})
