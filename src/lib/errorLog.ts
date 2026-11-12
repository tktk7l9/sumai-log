import { isNotFound, isRedirect } from '@tanstack/react-router'

/**
 * What a failed request leaves in the Workers log.
 *
 * Until 2026-10-06 a 500 only produced the invocation line (`GET https://…/`) and nothing about
 * the cause; the D1 read-limit incident of 2026-10-05 had to be reconstructed from the D1
 * statistics. These helpers turn an error into one log line: message, the reason it carries
 * as its cause, and a few stack frames, never request data (the app's own messages can carry a
 * title or an address; the error objects of D1, zod and fetch do not).
 *
 * One library error does carry request data: Drizzle wraps a failed statement in an Error
 * whose message is the SQL followed by every bound value (`Failed query: …\nparams: …`), and
 * V8 repeats the message at the top of the stack. The values are cut from both, and the reason
 * D1 gave, which Drizzle keeps only in `cause`, is logged instead.
 */

export type ErrorSummary = {
  name: string
  message: string
  /** `name: message` and the first frames, joined with ' | '. null when there are no frames */
  stack: string | null
  /** What the error says caused it (`name: message`). null when it names no cause */
  cause: string | null
}

const STACK_FRAMES = 6

const FAILED_QUERY_PREFIX = 'Failed query: '
const FAILED_QUERY_PARAMS = '\nparams: '

/** The message without the bound values of a failed Drizzle query */
function safeMessage(message: string): string {
  if (!message.startsWith(FAILED_QUERY_PREFIX)) return message
  const at = message.indexOf(FAILED_QUERY_PARAMS)
  return at === -1 ? message : message.slice(0, at)
}

/**
 * The first frames of the stack. V8 writes `name: message` and then the frames, so everything
 * after the message is a frame, whatever the message contains (a bound value that spans lines
 * can look like a frame). A stack that does not repeat the message is read by shape instead
 */
function framesOf(error: Error): string[] {
  if (!error.stack) return []
  const at = error.message === '' ? -1 : error.stack.indexOf(error.message)
  const lines = (at === -1 ? error.stack : error.stack.slice(at + error.message.length))
    .split('\n')
    .map((line) => line.trim())
  return (at === -1 ? lines.filter((line) => line.startsWith('at ')) : lines.filter(Boolean)).slice(
    0,
    STACK_FRAMES,
  )
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function describeCause(cause: unknown): string | null {
  if (cause === undefined || cause === null) return null
  if (cause instanceof Error) return `${cause.name}: ${safeMessage(cause.message)}`
  return stringify(cause)
}

export function describeError(error: unknown): ErrorSummary {
  if (error instanceof Error) {
    const message = safeMessage(error.message)
    const frames = framesOf(error)
    return {
      name: error.name,
      message,
      stack: frames.length > 0 ? [`${error.name}: ${message}`, ...frames].join(' | ') : null,
      cause: describeCause(error.cause),
    }
  }
  return { name: 'unknown', message: stringify(error), stack: null, cause: null }
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
  const { name, message, stack, cause } = describeError(error)
  return `${name}: ${message}${cause ? ` cause=${cause}` : ''}${stack ? ` stack=${stack}` : ''}`
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
