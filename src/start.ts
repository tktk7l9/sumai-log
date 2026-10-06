import { createMiddleware, createStart } from '@tanstack/react-start'

import { isTrustedMutation } from './lib/csrf'
import { formatError, isLoggableError } from './lib/errorLog'
import { applySecurityHeaders, securityHeadersInit } from './lib/securityHeaders'
import { recordSeen } from './server/activity'
import { requireUser } from './server/auth'

/**
 * Enforces authentication at the entry of every request (SSR, server function, server route).
 * Always done in the global middleware so that no individual route can forget to add it.
 *
 * Mutations check the Origin first. Even if the Access cookie is sent from another site,
 * only requests from the same Origin pass. Authentication is enforced after that.
 */
const authMiddleware = createMiddleware().server(async ({ next, request }) => {
  if (
    !isTrustedMutation({
      method: request.method,
      origin: request.headers.get('origin'),
      requestUrl: request.url,
    })
  ) {
    throw new Response('この操作は許可されていません。', {
      status: 403,
      headers: securityHeadersInit({ 'content-type': 'text/plain; charset=utf-8' }),
    })
  }

  const user = await requireUser(request)
  // Record the "last used" time of the person who passed authentication (does not delay the
  // response; throttled)
  recordSeen(user.email)
  try {
    const result = await next({ context: { user } })
    applySecurityHeaders(result.response.headers)
    return result
  } catch (e) {
    // When a route handler exits with throw new Response(...) (404 etc.), unlike a normal
    // return it does not pass through here and is served without the security headers.
    if (e instanceof Response) {
      applySecurityHeaders(e.headers)
      throw e
    }
    // Anything else is a failure nobody rendered: leave its cause in the Workers log
    // (lib/errorLog.ts). Render-time failures are logged by src/server.ts instead
    if (isLoggableError(e)) {
      console.error(
        `request error ${request.method} ${new URL(request.url).pathname} ${formatError(e)}`,
      )
    }
    throw e
  }
})

/**
 * A server function that throws answers the client with 500 and, before 2026-10-06, left no
 * trace of why. Logged here once per call, by the function's name, without its input
 */
const logFunctionErrors = createMiddleware({ type: 'function' }).server(
  async ({ next, serverFnMeta }) => {
    try {
      return await next()
    } catch (e) {
      if (isLoggableError(e)) {
        console.error(`server function error fn=${serverFnMeta.name} ${formatError(e)}`)
      }
      throw e
    }
  },
)

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [authMiddleware],
    functionMiddleware: [logFunctionErrors],
  }
})
