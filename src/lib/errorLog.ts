import { isNotFound, isRedirect } from '@tanstack/react-router'

/**
 * What a failed request leaves in the Workers log.
 *
 * Until 2026-10-06 a 500 only produced the invocation line (`GET https://…/`) and nothing about
 * the cause; the D1 read-limit incident of 2026-10-05 had to be reconstructed from the D1
 * statistics. These helpers turn an error into one log line: message and a few stack frames,
 * never request data (the app's own messages can carry a title or an address; the error
 * objects of D1, zod and fetch do not).
 */

export type ErrorSummary = {
  name: string
  message: string
  /** The first frames, joined with ' | '. null when the value has no stack */
  stack: string | null
}

const STACK_FRAMES = 6

export function describeError(error: unknown): ErrorSummary {
  if (error instanceof Error) {
    const stack = error.stack
      ? error.stack
          .split('\n')
          .slice(0, STACK_FRAMES + 1)
          .map((line) => line.trim())
          .join(' | ')
      : null
    return { name: error.name, message: error.message, stack }
  }
  let message: string
  if (typeof error === 'string') message = error
  else {
    try {
      message = JSON.stringify(error) ?? String(error)
    } catch {
      message = String(error)
    }
  }
  return { name: 'unknown', message, stack: null }
}

/**
 * A Response is a handler's answer (403 from the auth middleware, 404 of a server route) and
 * notFound / redirect are the router's control flow: none of them is a failure.
 */
export function isLoggableError(error: unknown): boolean {
  if (error instanceof Response) return false
  if (isNotFound(error) || isRedirect(error)) return false
  return true
}

export function formatError(error: unknown): string {
  const { name, message, stack } = describeError(error)
  return `${name}: ${message}${stack ? ` stack=${stack}` : ''}`
}

type MatchLike = { routeId: string; status: string; error?: unknown }

/** One line per route match whose loader failed during a server render */
export function renderErrorLines(matches: ReadonlyArray<MatchLike>, url: string): string[] {
  const path = pathOf(url)
  return matches
    .filter((m) => m.status === 'error' && isLoggableError(m.error))
    .map((m) => `render error path=${path} route=${m.routeId} ${formatError(m.error)}`)
}

function pathOf(url: string): string {
  try {
    const u = new URL(url)
    return `${u.pathname}${u.search}`
  } catch {
    return url
  }
}
