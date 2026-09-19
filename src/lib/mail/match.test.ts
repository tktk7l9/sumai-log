import { describe, expect, it } from 'vitest'

import {
  domainMatches,
  domainOf,
  matchVendorByDomain,
  normalizeDomains,
  splitDomains,
} from './match'

describe('normalizeDomains', () => {
  it('小文字化・空白除去・@ の右だけ・重複除去。空は null', () => {
    expect(normalizeDomains(' A.com, @Mail.B.com ,info@c.com,a.com ')).toBe(
      'a.com,mail.b.com,c.com',
    )
    expect(normalizeDomains('')).toBeNull()
    expect(normalizeDomains(' , ')).toBeNull()
    expect(normalizeDomains(null)).toBeNull()
    expect(normalizeDomains(undefined)).toBeNull()
  })
  it('改行区切りも受ける', () => {
    expect(normalizeDomains('a.com\nb.com')).toBe('a.com,b.com')
  })
})

describe('splitDomains', () => {
  it('カンマ区切りを配列に。null は空', () => {
    expect(splitDomains('a.com,b.com')).toEqual(['a.com', 'b.com'])
    expect(splitDomains(null)).toEqual([])
    expect(splitDomains('')).toEqual([])
  })
})

describe('domainOf', () => {
  it('表示名付き・大文字・空白を吸収する', () => {
    expect(domainOf('Some One <Some@Example.COM>')).toBe('example.com')
    expect(domainOf('  x@y.com ')).toBe('y.com')
  })
  it('@ が無い・空なら null', () => {
    expect(domainOf('nobody')).toBeNull()
    expect(domainOf('')).toBeNull()
    expect(domainOf('x@')).toBeNull()
  })
})

describe('domainMatches', () => {
  it('完全一致とサブドメインだけ一致する', () => {
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
  it('最初に一致した業者を返す', () => {
    expect(matchVendorByDomain('x@mail.news.a.jp', vendors)?.id).toBe('a')
    expect(matchVendorByDomain('Y <y@C.com>', vendors)?.id).toBe('c')
  })
  it('一致しない・差出人が読めないなら null', () => {
    expect(matchVendorByDomain('x@d.com', vendors)).toBeNull()
    expect(matchVendorByDomain('broken', vendors)).toBeNull()
  })
})
