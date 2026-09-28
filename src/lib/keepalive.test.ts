import { describe, expect, it, vi } from 'vitest'

import { withKeepalive } from './keepalive'

describe('withKeepalive', () => {
  it('adds keepalive and keeps every other request option', () => {
    const inner = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => 'response')
    const signal = new AbortController().signal
    const result = withKeepalive(inner)('/_serverFn/x', {
      method: 'POST',
      body: '{"id":"a"}',
      signal,
    })
    expect(result).toBe('response')
    expect(inner).toHaveBeenCalledWith('/_serverFn/x', {
      method: 'POST',
      body: '{"id":"a"}',
      signal,
      keepalive: true,
    })
  })

  it('works when no options are given', () => {
    const inner = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => 1)
    withKeepalive(inner)('/x')
    expect(inner).toHaveBeenCalledWith('/x', { keepalive: true })
  })
})
