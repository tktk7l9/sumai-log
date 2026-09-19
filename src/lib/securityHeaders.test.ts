import { describe, expect, it } from 'vitest'

import { SECURITY_HEADERS, applySecurityHeaders, securityHeadersInit } from './securityHeaders'

describe('applySecurityHeaders', () => {
  it('クリックジャッキングと MIME スニッフィングを止めるヘッダを載せる', () => {
    const headers = applySecurityHeaders(new Headers())
    expect(headers.get('x-frame-options')).toBe('DENY')
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('referrer-policy')).toBe('no-referrer')
    expect(headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(headers.get('permissions-policy')).toContain('camera=()')
    expect(headers.get('cross-origin-opener-policy')).toBe('same-origin')
  })

  it('img-src に Google マップのホストと i.ytimg.com が含まれ、地理院タイルは含まれない', () => {
    const headers = applySecurityHeaders(new Headers())
    const csp = headers.get('content-security-policy')
    expect(csp).toContain('https://maps.googleapis.com')
    expect(csp).toContain('https://maps.gstatic.com')
    expect(csp).toContain('https://i.ytimg.com')
    expect(csp).not.toContain('cyberjapandata.gsi.go.jp')
  })

  it('connect-src は self と Google マップ（ベクタータイル）だけ', () => {
    const headers = applySecurityHeaders(new Headers())
    const csp = headers.get('content-security-policy') ?? ''
    const connect = csp
      .split(';')
      .find((d) => d.trim().startsWith('connect-src'))
      ?.trim()
    expect(connect).toBe("connect-src 'self' https://maps.googleapis.com")
  })

  it('img-src に情報源（YouTube チャンネル）のアバターのホストが含まれる', () => {
    const headers = applySecurityHeaders(new Headers())
    const csp = headers.get('content-security-policy')
    expect(csp).toContain('https://yt3.ggpht.com')
    expect(csp).toContain('https://yt3.googleusercontent.com')
  })

  it('geolocation は self だけ許可する', () => {
    const headers = applySecurityHeaders(new Headers())
    expect(headers.get('permissions-policy')).toContain('geolocation=(self)')
  })

  it('同じ名前があれば上書きする', () => {
    const headers = new Headers({ 'x-frame-options': 'SAMEORIGIN' })
    applySecurityHeaders(headers)
    expect(headers.get('x-frame-options')).toBe(SECURITY_HEADERS['x-frame-options'])
  })
})

describe('securityHeadersInit', () => {
  it('content-type など既存の値は残す', () => {
    const headers = securityHeadersInit({ 'content-type': 'text/plain; charset=utf-8' })
    expect(headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(headers.get('x-content-type-options')).toBe('nosniff')
  })
})
