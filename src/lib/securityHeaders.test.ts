import { describe, expect, it } from 'vitest'

import { SECURITY_HEADERS, applySecurityHeaders, securityHeadersInit } from './securityHeaders'

describe('applySecurityHeaders', () => {
  it('sets the headers that stop clickjacking and MIME sniffing', () => {
    const headers = applySecurityHeaders(new Headers())
    expect(headers.get('x-frame-options')).toBe('DENY')
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('referrer-policy')).toBe('no-referrer')
    expect(headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(headers.get('permissions-policy')).toContain('camera=()')
    expect(headers.get('cross-origin-opener-policy')).toBe('same-origin')
  })

  it('includes the Google Maps hosts and i.ytimg.com in img-src, and not the GSI tiles', () => {
    const headers = applySecurityHeaders(new Headers())
    const csp = headers.get('content-security-policy')
    expect(csp).toContain('https://maps.googleapis.com')
    expect(csp).toContain('https://maps.gstatic.com')
    expect(csp).toContain('https://i.ytimg.com')
    expect(csp).not.toContain('cyberjapandata.gsi.go.jp')
  })

  it('limits connect-src to self and Google Maps (vector tiles)', () => {
    const headers = applySecurityHeaders(new Headers())
    const csp = headers.get('content-security-policy') ?? ''
    const connect = csp
      .split(';')
      .find((d) => d.trim().startsWith('connect-src'))
      ?.trim()
    expect(connect).toBe("connect-src 'self' https://maps.googleapis.com")
  })

  it('includes the avatar hosts of sources (YouTube channels) in img-src', () => {
    const headers = applySecurityHeaders(new Headers())
    const csp = headers.get('content-security-policy')
    expect(csp).toContain('https://yt3.ggpht.com')
    expect(csp).toContain('https://yt3.googleusercontent.com')
  })

  it('allows geolocation for self only', () => {
    const headers = applySecurityHeaders(new Headers())
    expect(headers.get('permissions-policy')).toContain('geolocation=(self)')
  })

  it('allows frames only from the no-cookie YouTube embed host', () => {
    const csp = SECURITY_HEADERS['content-security-policy']
    expect(csp).toContain('frame-src https://www.youtube-nocookie.com;')
    expect(csp).not.toContain('script-src')
  })

  it('overwrites a header of the same name', () => {
    const headers = new Headers({ 'x-frame-options': 'SAMEORIGIN' })
    applySecurityHeaders(headers)
    expect(headers.get('x-frame-options')).toBe(SECURITY_HEADERS['x-frame-options'])
  })
})

describe('securityHeadersInit', () => {
  it('keeps existing values such as content-type', () => {
    const headers = securityHeadersInit({ 'content-type': 'text/plain; charset=utf-8' })
    expect(headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(headers.get('x-content-type-options')).toBe('nosniff')
  })
})
