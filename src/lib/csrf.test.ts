import { describe, expect, it } from 'vitest'

import { isTrustedMutation } from './csrf'

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
