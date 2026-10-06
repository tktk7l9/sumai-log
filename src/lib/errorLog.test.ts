import { notFound, redirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { describeError, isLoggableError, renderErrorLines } from './errorLog'

describe('describeError', () => {
  it('keeps the name, message and the first lines of the stack of an Error', () => {
    const error = new TypeError('boom')
    error.stack = 'TypeError: boom\n    at a (file.js:1:1)\n    at b (file.js:2:2)'
    expect(describeError(error)).toEqual({
      name: 'TypeError',
      message: 'boom',
      stack: 'TypeError: boom | at a (file.js:1:1) | at b (file.js:2:2)',
    })
  })

  it('cuts a long stack after a few frames', () => {
    const error = new Error('deep')
    error.stack = [
      'Error: deep',
      ...Array.from({ length: 20 }, (_, i) => `    at f${i} (x.js)`),
    ].join('\n')
    const { stack } = describeError(error)
    expect(stack).toContain('at f5 (x.js)')
    expect(stack).not.toContain('at f6 (x.js)')
  })

  it('describes a thrown non-Error value', () => {
    expect(describeError('plain string')).toEqual({
      name: 'unknown',
      message: 'plain string',
      stack: null,
    })
    expect(describeError({ code: 7 })).toEqual({
      name: 'unknown',
      message: '{"code":7}',
      stack: null,
    })
    expect(describeError(undefined)).toEqual({ name: 'unknown', message: 'undefined', stack: null })
  })

  it('has no stack for an Error whose stack was stripped', () => {
    const error = new Error('bare')
    error.stack = undefined
    expect(describeError(error)).toEqual({ name: 'Error', message: 'bare', stack: null })
  })

  it('does not choke on a value that cannot be stringified', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(describeError(cyclic).message).toBe('[object Object]')
  })
})

describe('isLoggableError', () => {
  it('skips what the router uses for control flow and what handlers answer with', () => {
    expect(isLoggableError(notFound())).toBe(false)
    expect(isLoggableError(redirect({ to: '/' }))).toBe(false)
    expect(isLoggableError(new Response('forbidden', { status: 403 }))).toBe(false)
  })

  it('logs everything else', () => {
    expect(isLoggableError(new Error('x'))).toBe(true)
    expect(isLoggableError('x')).toBe(true)
    expect(isLoggableError(null)).toBe(true)
  })
})

describe('renderErrorLines', () => {
  const url = 'https://example.com/records?tab=videos'

  it('is empty when every match loaded', () => {
    expect(renderErrorLines([{ routeId: '/', status: 'success' }], url)).toEqual([])
  })

  it('writes one line per failed match with the path, the route and the error', () => {
    const error = new Error('D1_ERROR: too many requests')
    error.stack = 'Error: D1_ERROR: too many requests\n    at query (repo.js:3:3)'
    const lines = renderErrorLines(
      [
        { routeId: '__root__', status: 'success' },
        { routeId: '/records', status: 'error', error },
      ],
      url,
    )
    expect(lines).toEqual([
      'render error path=/records?tab=videos route=/records Error: D1_ERROR: too many requests stack=Error: D1_ERROR: too many requests | at query (repo.js:3:3)',
    ])
  })

  it('leaves out not-found matches (a 404 is an answer, not a failure)', () => {
    expect(
      renderErrorLines([{ routeId: '/places/$id', status: 'error', error: notFound() }], url),
    ).toEqual([])
  })

  it('falls back to the raw value when the url is not a URL', () => {
    expect(
      renderErrorLines([{ routeId: '/x', status: 'error', error: 'bad' }], '/only-path'),
    ).toEqual(['render error path=/only-path route=/x unknown: bad'])
  })

  it('writes the error even when the match has no stack', () => {
    expect(renderErrorLines([{ routeId: '/x', status: 'error', error: 'bad' }], url)).toEqual([
      'render error path=/records?tab=videos route=/x unknown: bad',
    ])
  })
})
