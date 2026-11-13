import { describe, expect, it } from 'vitest'

import { isSameSiteRead, isTrustedMutation } from './csrf'

const APP = 'https://sumai-log.example.workers.dev/settings'

describe('isTrustedMutation', () => {
  it('lets GET / HEAD / OPTIONS through even without Origin', () => {
    expect(isTrustedMutation({ method: 'GET', origin: null, requestUrl: APP })).toBe(true)
    expect(isTrustedMutation({ method: 'head', origin: null, requestUrl: APP })).toBe(true)
    expect(isTrustedMutation({ method: 'OPTIONS', origin: null, requestUrl: APP })).toBe(true)
  })

  it('lets a POST from the same Origin through', () => {
    expect(
      isTrustedMutation({
        method: 'POST',
        origin: 'https://sumai-log.example.workers.dev',
        requestUrl: APP,
      }),
    ).toBe(true)
  })

  it('rejects a different Origin, a missing one and a broken value', () => {
    expect(
      isTrustedMutation({
        method: 'POST',
        origin: 'https://evil.example',
        requestUrl: APP,
      }),
    ).toBe(false)
    expect(isTrustedMutation({ method: 'POST', origin: null, requestUrl: APP })).toBe(false)
    expect(isTrustedMutation({ method: 'POST', origin: '  ', requestUrl: APP })).toBe(false)
    expect(isTrustedMutation({ method: 'POST', origin: 'not a url', requestUrl: APP })).toBe(false)
    expect(
      isTrustedMutation({ method: 'DELETE', origin: 'https://evil.example', requestUrl: APP }),
    ).toBe(false)
    expect(
      isTrustedMutation({
        method: 'POST',
        origin: 'https://sumai-log.example.workers.dev',
        requestUrl: 'not a url',
      }),
    ).toBe(false)
  })

  it('does not let an http / https mix-up through', () => {
    expect(
      isTrustedMutation({
        method: 'POST',
        origin: 'http://sumai-log.example.workers.dev',
        requestUrl: APP,
      }),
    ).toBe(false)
  })
})

describe('isSameSiteRead', () => {
  it('lets the app read its own pages and data', () => {
    expect(isSameSiteRead({ site: 'same-origin', mode: 'cors' })).toBe(true)
    expect(isSameSiteRead({ site: 'same-origin', mode: 'no-cors' })).toBe(true)
  })

  it('lets a request the user started through (address bar, bookmark, home screen icon)', () => {
    expect(isSameSiteRead({ site: 'none', mode: 'navigate' })).toBe(true)
  })

  it('lets a page be opened from anywhere (a link in a mail, the return from the Access login)', () => {
    expect(isSameSiteRead({ site: 'cross-site', mode: 'navigate', dest: 'document' })).toBe(true)
    expect(isSameSiteRead({ site: 'same-site', mode: 'navigate', dest: 'document' })).toBe(true)
    // Safari before 16.4 sends no Sec-Fetch-Dest
    expect(isSameSiteRead({ site: 'cross-site', mode: 'navigate' })).toBe(true)
    expect(isSameSiteRead({ site: 'cross-site', mode: 'navigate', dest: '' })).toBe(true)
  })

  it('rejects another site that loads this app as data, an image, a script or a frame', () => {
    expect(isSameSiteRead({ site: 'cross-site', mode: 'cors' })).toBe(false)
    expect(isSameSiteRead({ site: 'cross-site', mode: 'no-cors' })).toBe(false)
    expect(isSameSiteRead({ site: 'cross-site', mode: 'navigate', dest: 'iframe' })).toBe(false)
    expect(isSameSiteRead({ site: 'cross-site', mode: 'navigate', dest: 'embed' })).toBe(false)
    expect(isSameSiteRead({ site: 'cross-site', mode: null })).toBe(false)
  })

  it('treats a sibling host as another site (other Workers share the workers.dev account domain)', () => {
    expect(isSameSiteRead({ site: 'same-site', mode: 'cors' })).toBe(false)
    expect(isSameSiteRead({ site: 'same-site', mode: 'no-cors' })).toBe(false)
  })

  it('lets a client that sends no Fetch Metadata through (curl, an old browser): nothing to judge by', () => {
    expect(isSameSiteRead({ site: null, mode: null })).toBe(true)
    expect(isSameSiteRead({ site: undefined, mode: undefined })).toBe(true)
    expect(isSameSiteRead({ site: '', mode: 'cors' })).toBe(true)
  })

  it('reads the header values whatever their case', () => {
    expect(isSameSiteRead({ site: 'Cross-Site', mode: 'CORS' })).toBe(false)
    expect(isSameSiteRead({ site: 'Cross-Site', mode: 'Navigate', dest: 'Document' })).toBe(true)
    expect(isSameSiteRead({ site: ' Same-Origin ', mode: 'cors' })).toBe(true)
  })

  it('rejects a value it does not know (a new kind of cross-site request fails closed)', () => {
    expect(isSameSiteRead({ site: 'elsewhere', mode: 'cors' })).toBe(false)
  })
})
