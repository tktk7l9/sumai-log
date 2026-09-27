/**
 * Origin check for mutating requests.
 *
 * The Cloudflare Access cookie can have a loose SameSite, so a POST from another
 * site may still carry the JWT and pass authentication. A browser cannot forge Origin,
 * so mutations accept only requests from this app itself.
 *
 * GET / HEAD / OPTIONS only read (or are preflight), so they are not checked.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function isTrustedMutation({
  method,
  origin,
  requestUrl,
}: {
  method: string
  origin: string | null | undefined
  requestUrl: string
}): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true
  if (!origin || origin.trim() === '') return false

  try {
    return new URL(origin).origin === new URL(requestUrl).origin
  } catch {
    return false
  }
}
