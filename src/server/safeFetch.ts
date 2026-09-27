/**
 * Manual redirect following to allowed URLs (part of the SSRF guard). Shared by
 * newsFetcher.ts (vendor news fetch) and vendorImages.ts (favicon and representative
 * photo fetch).
 *
 * The fetch of Cloudflare Workers follows redirects automatically by default. If left to
 * follow, after passing "the first fetch to an allowed URL", a later 3xx would jump (to an
 * internal host etc.) without ever going through isAllowedRemoteUrl. So it uses
 * `redirect: 'manual'`, and every time a 3xx is received it resolves Location here
 * against the current URL and runs it through isAllowed (default isAllowedRemoteUrl)
 * again before fetching the next hop (fetchImpl is never called for a disallowed hop
 * target). When 3xx continue beyond maxHops (default 3), that is the same error too.
 * A 3xx without Location is not treated as a redirect, and the response is returned as is
 * (left to the later response.ok check).
 */

import { truncate } from '../lib/news/text'
import { isAllowedRemoteUrl } from '../lib/news/url'

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
/**
 * Limit of the error message returned to the caller (for the sake of where it is stored,
 * e.g. news_fetch_error in D1)
 */
const ERROR_MESSAGE_MAX = 200

export type GuardedFetchOutcome = { response: Response; finalUrl: string } | { error: string }

export type FetchWithGuardedRedirectsOptions = {
  /** Timeout per hop (milliseconds). A new AbortSignal.timeout is created for each hop */
  timeoutMs: number
  headers?: Record<string, string>
  /** Maximum number of redirects to follow (not counting the first fetch). Default 3 */
  maxHops?: number
  /** Decides whether to allow the URL of a hop target. Default isAllowedRemoteUrl */
  isAllowed?: (url: string) => boolean
  fetchImpl?: typeof fetch
  /** Error message for: hop limit exceeded, failure to resolve Location, or a disallowed hop target */
  redirectBlockedError?: string
}

function errorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : '取得に失敗しました'
  return truncate(message, ERROR_MESSAGE_MAX)
}

export async function fetchWithGuardedRedirects(
  startUrl: string,
  opts: FetchWithGuardedRedirectsOptions,
): Promise<GuardedFetchOutcome> {
  const {
    timeoutMs,
    headers,
    maxHops = 3,
    isAllowed = isAllowedRemoteUrl,
    fetchImpl = fetch,
    redirectBlockedError = 'リダイレクト先が許可されていません',
  } = opts

  let currentUrl = startUrl

  for (let hop = 0; ; hop++) {
    let response: Response
    try {
      response = await fetchImpl(currentUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        headers,
        redirect: 'manual',
      })
    } catch (e) {
      return { error: errorMessage(e) }
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: currentUrl }
    }
    if (hop >= maxHops) {
      return { error: redirectBlockedError }
    }

    const location = response.headers.get('location')
    if (!location) {
      return { response, finalUrl: currentUrl }
    }

    let resolved: string
    try {
      resolved = new URL(location, currentUrl).href
    } catch {
      return { error: redirectBlockedError }
    }
    if (!isAllowed(resolved)) {
      return { error: redirectBlockedError }
    }

    currentUrl = resolved
  }
}
