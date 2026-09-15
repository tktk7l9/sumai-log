import { describe, expect, it } from 'vitest'

import { isTrustedMutation } from './csrf'

const APP = 'https://sumai-log.example.workers.dev/settings'

describe('isTrustedMutation', () => {
  it('GET / HEAD / OPTIONS は Origin 無しでも通す', () => {
    expect(isTrustedMutation({ method: 'GET', origin: null, requestUrl: APP })).toBe(true)
    expect(isTrustedMutation({ method: 'head', origin: null, requestUrl: APP })).toBe(true)
    expect(isTrustedMutation({ method: 'OPTIONS', origin: null, requestUrl: APP })).toBe(true)
  })

  it('同じ Origin からの POST は通す', () => {
    expect(
      isTrustedMutation({
        method: 'POST',
        origin: 'https://sumai-log.example.workers.dev',
        requestUrl: APP,
      }),
    ).toBe(true)
  })

  it('別 Origin・未設定・壊れた値は拒否する', () => {
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

  it('http と https の取り違えは通さない', () => {
    expect(
      isTrustedMutation({
        method: 'POST',
        origin: 'http://sumai-log.example.workers.dev',
        requestUrl: APP,
      }),
    ).toBe(false)
  })
})
