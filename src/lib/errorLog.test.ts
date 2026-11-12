import { notFound, redirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { describeError, formatError, isLoggableError, renderErrorLines } from './errorLog'

describe('describeError', () => {
  it('keeps the name, message and the first lines of the stack of an Error', () => {
    const error = new TypeError('boom')
    error.stack = 'TypeError: boom\n    at a (file.js:1:1)\n    at b (file.js:2:2)'
    expect(describeError(error)).toEqual({
      name: 'TypeError',
      message: 'boom',
      stack: 'TypeError: boom | at a (file.js:1:1) | at b (file.js:2:2)',
      cause: null,
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
      cause: null,
    })
    expect(describeError({ code: 7 })).toEqual({
      name: 'unknown',
      message: '{"code":7}',
      stack: null,
      cause: null,
    })
    expect(describeError(undefined)).toEqual({
      name: 'unknown',
      message: 'undefined',
      stack: null,
      cause: null,
    })
  })

  it('has no stack for an Error whose stack was stripped', () => {
    const error = new Error('bare')
    error.stack = undefined
    expect(describeError(error)).toEqual({
      name: 'Error',
      message: 'bare',
      stack: null,
      cause: null,
    })
  })

  it('has no stack when the stack is only the message', () => {
    const error = new Error('no frames')
    error.stack = 'Error: no frames'
    expect(describeError(error).stack).toBeNull()
  })

  it('reads the frames of a stack that does not repeat the message', () => {
    const error = new Error('boom')
    error.stack = 'Error: something else\n    at a (x.js)\nnoise\n    at b (y.js)'
    expect(describeError(error).stack).toBe('Error: boom | at a (x.js) | at b (y.js)')
  })

  it('reads the frames of an Error with an empty message', () => {
    const error = new Error('')
    error.stack = 'Error\n    at a (x.js)'
    expect(describeError(error).stack).toBe('Error:  | at a (x.js)')
  })

  it('does not choke on a value that cannot be stringified', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(describeError(cyclic).message).toBe('[object Object]')
  })

  it('has no cause for an Error without one', () => {
    expect(describeError(new Error('alone')).cause).toBeNull()
  })

  it('keeps the reason carried by the cause', () => {
    const error = new Error('wrapper', { cause: new RangeError('the real reason') })
    expect(describeError(error).cause).toBe('RangeError: the real reason')
  })

  it('describes a cause that is not an Error', () => {
    expect(describeError(new Error('wrapper', { cause: 'offline' })).cause).toBe('offline')
    expect(describeError(new Error('wrapper', { cause: { code: 7 } })).cause).toBe('{"code":7}')
  })
})

/**
 * Drizzle wraps a failed statement in an Error whose message is the SQL followed by every
 * bound value (`Failed query: …\nparams: …`): the values are what the user typed (a title, an
 * address, a memo that spans lines).
 */
describe('a failed Drizzle query', () => {
  const failedQuery = (params: string, cause?: unknown) => {
    const error = new Error(
      `Failed query: insert into "videos" ("id", "title") values (?, ?)\nparams: ${params}`,
      cause === undefined ? undefined : { cause },
    )
    error.stack = `Error: ${error.message}\n    at run (session.js:1:1)\n    at save (videos.js:2:2)`
    return error
  }

  it('logs the statement without the bound values', () => {
    const summary = describeError(failedQuery('id-1,テスト市の家の題名'))
    expect(summary.message).toBe('Failed query: insert into "videos" ("id", "title") values (?, ?)')
    expect(JSON.stringify(summary)).not.toContain('テスト市')
  })

  it('keeps the values out of the stack, even when a value spans lines', () => {
    const { stack } = describeError(failedQuery('id-1,一行目\n    at 二行目\n三行目'))
    expect(stack).toBe(
      'Error: Failed query: insert into "videos" ("id", "title") values (?, ?) | at run (session.js:1:1) | at save (videos.js:2:2)',
    )
  })

  it('says why the statement failed (the D1 error is the cause)', () => {
    const cause = new Error('D1_ERROR: UNIQUE constraint failed: videos.id: SQLITE_CONSTRAINT')
    expect(formatError(failedQuery('id-1,題名', cause))).toBe(
      'Error: Failed query: insert into "videos" ("id", "title") values (?, ?)' +
        ' cause=Error: D1_ERROR: UNIQUE constraint failed: videos.id: SQLITE_CONSTRAINT' +
        ' stack=Error: Failed query: insert into "videos" ("id", "title") values (?, ?) | at run (session.js:1:1) | at save (videos.js:2:2)',
    )
  })

  it('strips the values from a cause that is itself a failed query', () => {
    const outer = new Error('batch failed', { cause: failedQuery('id-1,テスト市') })
    expect(describeError(outer).cause).toBe(
      'Error: Failed query: insert into "videos" ("id", "title") values (?, ?)',
    )
  })
})

describe('formatError', () => {
  it('is name and message when there is neither a cause nor a stack', () => {
    expect(formatError('bad')).toBe('unknown: bad')
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
