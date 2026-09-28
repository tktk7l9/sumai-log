/**
 * Pure function that turns the failure reason of fetching vendor news / a site icon into wording
 * for the settings page.
 *
 * Some vendor sites refuse all access from Cloudflare's IP ranges (confirmed on a real site:
 * an Apache WAF returns 403 regardless of User-Agent). In that case the error has the form
 * `HTTP ${response.status}` (e.g. `HTTP 403`) left by the caller of `readCappedBytes` in
 * newsFetcher.ts. This is not "the fetch implementation is bad" but "the site refuses
 * Cloudflare", so tell the user exactly that (do not hide the fact that auto-fetch is
 * impossible).
 */

/** HTTP statuses that most likely mean access from Cloudflare is refused.
 * 403: Forbidden (the most common WAF refusal). 401: Unauthorized (returned by some WAFs).
 * 451: Unavailable For Legal Reasons (rarely used for region/network level blocks). */
const BLOCKED_STATUSES = new Set(['401', '403', '451'])

const HTTP_STATUS_ERROR = /^HTTP (\d{3})$/

const BLOCKED_HINT =
  'このサイトはお知らせを自動取得できません。メール取り込み（予定）か URL を空にしてください'

export type FetchErrorDescription = { label: string; hint?: string }

/**
 * Turns `error` (the string stored in vendors.news_fetch_error etc.) into a label/hint for
 * display. A form like `HTTP 403` (left by newsFetcher.ts) is judged as Cloudflare being
 * refused and reworded frankly. Other reasons (timeout, parse failure, etc.) are used as the
 * label as is. When `error` is null (never fetched, or the latest fetch succeeded) an
 * empty-string label is returned (callers are expected to call this only when `error` is
 * truthy, but passing null does not throw).
 */
export function describeFetchError(error: string | null): FetchErrorDescription {
  if (!error) return { label: '' }
  const m = HTTP_STATUS_ERROR.exec(error)
  if (m && BLOCKED_STATUSES.has(m[1])) {
    return {
      label: `サイト側が Cloudflare からのアクセスを拒否（HTTP ${m[1]}）`,
      hint: BLOCKED_HINT,
    }
  }
  return { label: error }
}
