/**
 * Decides whether a URL may actually be fetched from the server (one layer of the
 * defense in depth against SSRF). It was originally only for vendor news URLs, but the same
 * check is used for importing the representative's photo by URL and fetching the favicon
 * (src/server/vendorImages.ts), so it was renamed to `isAllowedRemoteUrl`.
 * `isAllowedNewsUrl` is an alias (the export const below) that keeps the existing callers
 * (optionalHttpsUrl in zod.ts, newsFetcher.ts, VendorForm.tsx) working unchanged.
 *
 * The fetch of Cloudflare Workers has no route to private networks (10.0.0.0/8 etc.) in the
 * first place, and there is no API to look at DNS resolution results. So this hostname
 * denylist is a "just in case" layer of defense in depth, and the main defense is the network
 * boundary of Workers itself.
 *
 * For redirects, newsFetcher.ts / vendorImages.ts set `redirect: 'manual'` and pass every
 * resolved `Location` through this function again (3 hops at most). This function itself
 * only makes the same decision for whatever URL it is called with, and is not aware of
 * whether that is the first URL or a redirect target.
 */

const DENYLISTED_EXACT_HOSTS = new Set([
  'localhost',
  // The custom domain of this app itself. If a vendor news source is led here by a redirect,
  // the Worker ends up sending a request to itself (or to another Worker).
  'sumai-log.app',
])

const DENYLISTED_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.home.arpa',
  '.workers.dev',
  '.cloudflareaccess.com',
  '.sumai-log.app',
]

/** Drops the trailing '.' (FQDN notation) and lowercases. Unless it is dropped first, a trailing
 * dot could bypass the suffix check of the denylist, such as workers.dev. */
function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase()
  return lower.endsWith('.') ? lower.slice(0, -1) : lower
}

/** `new URL()` also converts other IPv4 notations such as hex, octal and decimal into the
 * canonical 'a.b.c.d', so looking only at the normalized form here also rejects bypasses
 * through another notation. */
function isIpv4Literal(hostname: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
}

export function isAllowedRemoteUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:') return false
  if (parsed.username !== '' || parsed.password !== '') return false
  if (parsed.port !== '') return false // Reject anything but the default port (443)

  const hostname = normalizeHostname(parsed.hostname)
  if (hostname.startsWith('[')) return false // Bracketed IPv6 literal
  if (isIpv4Literal(hostname)) return false
  // The exact-match deny check runs before the dot-required check below ('localhost' has no
  // dot, so with the order reversed it would be rejected by the dot check alone and this
  // branch could not be reached in tests).
  if (DENYLISTED_EXACT_HOSTS.has(hostname)) return false
  if (!hostname.includes('.')) return false
  if (DENYLISTED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return false

  return true
}

/** Old name of `isAllowedRemoteUrl`. Existing callers may keep importing this one */
export const isAllowedNewsUrl = isAllowedRemoteUrl

/**
 * Whether the hostnames of 2 URLs match. Used in the "候補のサイトアイコン" (Candidate site
 * icons) card of settings.tsx to decide whether the failure reason of the vendor news fetch
 * (newsFetchError) may be reused as a hint for the icon fetch. When news_url and website_url
 * are different hosts, showing the refusal reason of the news side (a server that refuses
 * Cloudflare) as the reason for the icon fetch is only a guess (pointed out in the PR #12
 * review). When either one is null or cannot be read as a URL the result is false (treated
 * as different hosts = no hint is shown and it falls back to the neutral "未取得" (Not
 * fetched) display. The safe side).
 */
export function sameHost(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  try {
    return normalizeHostname(new URL(a).hostname) === normalizeHostname(new URL(b).hostname)
  } catch {
    return false
  }
}
