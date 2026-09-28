/**
 * Defensive headers for the browser, attached to every response.
 *
 * Even behind Cloudflare Access, the app itself stops clickjacking and MIME sniffing.
 * The CSP stays within a range that does not break the inline code of Vite / Mantine
 * (only `frame-ancestors`, `object-src` and `base-uri`. `img-src`/`connect-src` were added
 * for Google Maps on the map tab (tiles, fonts and sprites come from maps.googleapis.com
 * and maps.gstatic.com, vector tiles go through connect-src) and for video thumbnails and
 * the avatars of sources (YouTube channels)).
 * `geolocation=(self)` is allowed for the "現在地" (Current location) button on the map tab.
 */

export const SECURITY_HEADERS = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(self), payment=()',
  'cross-origin-opener-policy': 'same-origin',
  'content-security-policy':
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; img-src 'self' data: blob: https://i.ytimg.com https://yt3.ggpht.com https://yt3.googleusercontent.com https://maps.googleapis.com https://maps.gstatic.com https://*.googleusercontent.com; connect-src 'self' https://maps.googleapis.com",
} as const

/** Sets them on an existing Headers, overwriting. */
export function applySecurityHeaders(headers: Headers): Headers {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value)
  }
  return headers
}

/** For mixing into the headers of `new Response`. */
export function securityHeadersInit(extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  return applySecurityHeaders(headers)
}
