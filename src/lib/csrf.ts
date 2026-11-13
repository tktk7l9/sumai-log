/**
 * Origin check for mutating requests.
 *
 * The Cloudflare Access cookie can have a loose SameSite, so a POST from another
 * site may still carry the JWT and pass authentication. A browser cannot forge Origin,
 * so mutations accept only requests from this app itself.
 *
 * GET / HEAD / OPTIONS only read (or are preflight), so they are not checked here; what may
 * read is decided by isSameSiteRead below.
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

/**
 * Resource isolation for reads, from the Fetch Metadata headers the browser sets itself
 * (`Sec-Fetch-Site`, `Sec-Fetch-Mode`, `Sec-Fetch-Dest`; a page cannot forge them).
 *
 * A read changes nothing, but with a loose SameSite on the Access cookie another site can
 * still make the browser ask for a page, a photo or a server function's answer with the
 * user's session and learn from what comes back (whether it loaded, how large, how slow).
 * So a read is answered only when this app asked for it, when the user did (address bar,
 * bookmark, home screen icon = `none`), or when it is a top-level navigation (a link in a
 * mail, the return from the Access login), not a frame. A sibling host counts as another
 * site: on workers.dev every Worker of the account shares one registrable domain.
 *
 * A request without the headers (curl, a browser from before 2023) passes: there is nothing to
 * judge by, and authentication still applies to it.
 */
export function isSameSiteRead({
  site,
  mode,
  dest,
}: {
  site: string | null | undefined
  mode: string | null | undefined
  dest?: string | null | undefined
}): boolean {
  const from = normalize(site)
  if (from === '' || from === 'same-origin' || from === 'none') return true
  if (normalize(mode) !== 'navigate') return false
  const to = normalize(dest)
  return to === '' || to === 'document'
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}
