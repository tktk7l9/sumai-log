import { describe, expect, it } from 'vitest'

import { isAllowedNewsUrl, isAllowedRemoteUrl, sameHost } from './url'

describe('isAllowedRemoteUrl', () => {
  it('isAllowedNewsUrl is an alias of isAllowedRemoteUrl (the same function)', () => {
    expect(isAllowedNewsUrl).toBe(isAllowedRemoteUrl)
  })

  it('the allow check for calls from vendorImages (favicon fetch) also passes through the same function', () => {
    expect(isAllowedRemoteUrl('https://vendor.example.com/')).toBe(true)
  })
})

describe('isAllowedNewsUrl', () => {
  it('allows a public https hostname', () => {
    expect(isAllowedNewsUrl('https://news.example.com/feed/')).toBe(true)
  })

  it('normalizes and allows the FQDN notation with a trailing . too', () => {
    expect(isAllowedNewsUrl('https://news.example.com./feed/')).toBe(true)
  })

  it('lowercases an uppercase hostname before checking', () => {
    expect(isAllowedNewsUrl('https://NEWS.EXAMPLE.COM/feed/')).toBe(true)
  })

  it('rejects http', () => {
    expect(isAllowedNewsUrl('http://news.example.com/feed/')).toBe(false)
  })

  it('rejects a string that cannot be read as a URL', () => {
    expect(isAllowedNewsUrl('not a url')).toBe(false)
  })

  it('rejects a URL with userinfo (user:pass@)', () => {
    expect(isAllowedNewsUrl('https://user:pass@news.example.com/feed/')).toBe(false)
  })

  it('rejects a non-default port', () => {
    expect(isAllowedNewsUrl('https://news.example.com:8443/feed/')).toBe(false)
  })

  it('allows the default port (443) even when written explicitly', () => {
    expect(isAllowedNewsUrl('https://news.example.com:443/feed/')).toBe(true)
  })

  it('rejects an IPv4 literal', () => {
    expect(isAllowedNewsUrl('https://192.168.1.1/feed/')).toBe(false)
  })

  it('also rejects an IPv4 literal in another notation such as hex (after URL normalization)', () => {
    expect(isAllowedNewsUrl('https://0x7f000001/feed/')).toBe(false)
  })

  it('does not reject a hostname that contains an IPv4 but is not one as a whole', () => {
    expect(isAllowedNewsUrl('https://203.0.113.5.news.example.com/feed/')).toBe(true)
  })

  it('rejects a bracketed IPv6 literal', () => {
    expect(isAllowedNewsUrl('https://[::1]/feed/')).toBe(false)
    expect(isAllowedNewsUrl('https://[2001:db8::1]/feed/')).toBe(false)
  })

  it('rejects localhost', () => {
    expect(isAllowedNewsUrl('https://localhost/feed/')).toBe(false)
  })

  it('rejects a hostname without a dot (including internal names other than localhost)', () => {
    expect(isAllowedNewsUrl('https://intranet/feed/')).toBe(false)
  })

  it('rejects a hostname ending in .localhost / .local / .internal / .home.arpa', () => {
    expect(isAllowedNewsUrl('https://foo.localhost/feed/')).toBe(false)
    expect(isAllowedNewsUrl('https://printer.local/feed/')).toBe(false)
    expect(isAllowedNewsUrl('https://service.internal/feed/')).toBe(false)
    expect(isAllowedNewsUrl('https://host.home.arpa/feed/')).toBe(false)
  })

  it('rejects a hostname ending in .workers.dev / .cloudflareaccess.com', () => {
    expect(isAllowedNewsUrl('https://some-worker.workers.dev/feed/')).toBe(false)
    expect(isAllowedNewsUrl('https://team.cloudflareaccess.com/feed/')).toBe(false)
  })

  it('rejects the host of this app itself (sumai-log.app and its subdomains)', () => {
    expect(isAllowedNewsUrl('https://sumai-log.app/feed/')).toBe(false)
    expect(isAllowedNewsUrl('https://www.sumai-log.app/feed/')).toBe(false)
  })

  it('a trailing dot cannot bypass the suffix check of the denylist', () => {
    expect(isAllowedNewsUrl('https://some-worker.workers.dev./feed/')).toBe(false)
  })
})

describe('sameHost', () => {
  it('true for the same hostname', () => {
    expect(sameHost('https://vendor.example.com/news/', 'https://vendor.example.com/')).toBe(true)
  })

  it('true for the same hostname even when the path or case differs', () => {
    expect(sameHost('https://Vendor.example.com/news/feed', 'https://vendor.example.com/')).toBe(
      true,
    )
  })

  it('false for a different host', () => {
    expect(sameHost('https://news.example.com/feed/', 'https://vendor.example.com/')).toBe(false)
  })

  it('a different subdomain counts as a different host and gives false', () => {
    expect(sameHost('https://www.vendor.example.com/', 'https://vendor.example.com/')).toBe(false)
  })

  it('false when either one is null', () => {
    expect(sameHost(null, 'https://vendor.example.com/')).toBe(false)
    expect(sameHost('https://vendor.example.com/', null)).toBe(false)
    expect(sameHost(null, null)).toBe(false)
  })

  it('false for a string that cannot be read as a URL', () => {
    expect(sameHost('not a url', 'https://vendor.example.com/')).toBe(false)
    expect(sameHost('https://vendor.example.com/', 'not a url')).toBe(false)
  })
})
