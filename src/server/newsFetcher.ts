/**
 * The layer that actually goes and fetches the vendor news (RSS / HTML). Policy of
 * design.md §1: per source a 10 second timeout, a 1 MB cap, and an explicit User-Agent. On
 * a failure the other sources continue, and the reason is kept in `vendors.news_fetch_error`.
 *
 * `fetchImpl` can be injected, and worker tests swap in a fake that returns fictional
 * RSS/HTML (real vendor sites are not hit).
 */

import type { Db } from '../db/client'
import type { Vendor } from '../db/schema'
import { detectCharset } from '../lib/news/charset'
import { extractEvent } from '../lib/news/eventDate'
import { parseHtmlList } from '../lib/news/htmlList'
import { parseRss, type NewsCandidate } from '../lib/news/rss'
import { truncate } from '../lib/news/text'
import { isAllowedNewsUrl } from '../lib/news/url'
import { insertNewsIfNew, listNewsSources, markNewsFetched, type NewNews } from './repository/news'
import { fetchWithGuardedRedirects } from './safeFetch'

export type NewsSourceVendor = Pick<Vendor, 'id' | 'name' | 'newsUrl' | 'newsSource'>

const TIMEOUT_MS = 10_000
const MAX_BYTES = 1_000_000
const USER_AGENT = 'sumai-log/1.0'
const TOO_LARGE_ERROR = '応答が上限（1MB）を超えました'
/** The error for exceeding the redirect limit, failing to resolve Location, or a disallowed hop target. */
const REDIRECT_BLOCKED_ERROR = 'リダイレクト先が許可されていません'
/** The length cap for what is kept in vendors.news_fetch_error. There is no telling how long
 * the message of an exception gets (D1 errors, etc.), so it is cut here. The stack is never
 * included in the first place (only Error#message is looked at. stack is not referenced here
 * at all). */
const ERROR_MESSAGE_MAX = 200

type FetchOutcome = { candidates: NewsCandidate[] } | { error: string }

/**
 * Reads the response body as raw bytes. When `content-length` exists, reject with it first
 * (no need to read the body). Otherwise count the total bytes while reading the stream and
 * abort reading at the moment it exceeds 1 MB (not truncating after reading everything).
 * Turning it into a string (decoding according to charset) is the caller's responsibility
 * (detectCharset needs the raw bytes).
 */
async function readCappedBytes(response: Response): Promise<Uint8Array | { error: string }> {
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    return { error: TOO_LARGE_ERROR }
  }

  const reader = response.body?.getReader()
  if (!reader) {
    const buf = new Uint8Array(await response.arrayBuffer())
    return buf.byteLength > MAX_BYTES ? { error: TOO_LARGE_ERROR } : buf
  }

  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {})
      return { error: TOO_LARGE_ERROR }
    }
    chunks.push(value)
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

/**
 * `charset` is the label determined from the Content-Type header / `<meta charset>`
 * (the return value of detectCharset). `TextDecoder` throws for a label it does not know,
 * so in that case fall back to utf-8 (text may be garbled, but the fetch itself is not given up).
 */
function decodeWithCharset(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** Looks only at Error#message (stack is not included). Truncates at ERROR_MESSAGE_MAX. */
function errorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : '取得に失敗しました'
  return truncate(message, ERROR_MESSAGE_MAX)
}

async function fetchCandidates(
  vendor: NewsSourceVendor,
  fetchImpl: typeof fetch,
): Promise<FetchOutcome> {
  if (!vendor.newsUrl) return { error: '取得 URL が未設定です' }
  if (!vendor.newsSource) return { error: '取得方法が未設定です' }
  // The form side (optionalHttpsUrl in src/server/zod.ts) runs the same check too, but to
  // apply the same defence to existing data (seed imports that do not go through the form,
  // etc.), reject here once more right before the actual fetch (defence in depth against SSRF).
  if (!isAllowedNewsUrl(vendor.newsUrl)) return { error: 'URL が許可されていません' }

  // Following redirects and the per-hop allow check are delegated to safeFetch.ts (shared
  // with vendorImages.ts).
  const redirectOutcome = await fetchWithGuardedRedirects(vendor.newsUrl, {
    timeoutMs: TIMEOUT_MS,
    headers: { 'User-Agent': USER_AGENT },
    isAllowed: isAllowedNewsUrl,
    fetchImpl,
    redirectBlockedError: REDIRECT_BLOCKED_ERROR,
  })
  if ('error' in redirectOutcome) return { error: redirectOutcome.error }
  const { response, finalUrl } = redirectOutcome

  if (!response.ok) return { error: `HTTP ${response.status}` }

  let bytes: Uint8Array | { error: string }
  try {
    bytes = await readCappedBytes(response)
  } catch (e) {
    return { error: errorMessage(e) }
  }
  if (!(bytes instanceof Uint8Array)) return bytes

  const charset = detectCharset(response.headers.get('content-type'), bytes)
  const body = decodeWithCharset(bytes, charset)

  // Relative links are resolved against the final URL that actually returned the body (after redirects)
  const candidates = vendor.newsSource === 'rss' ? parseRss(body) : parseHtmlList(body, finalUrl)
  return { candidates }
}

/**
 * Fetches and saves for 1 vendor. Picks parseRss / parseHtmlList according to `newsSource`,
 * applies extractEvent to each candidate, then insertNewsIfNew (INSERT of new items only),
 * and at the end always calls markNewsFetched (error is null on success, the reason on failure).
 *
 * Even when the DB work after the fetch (insertNewsIfNew, etc.) throws, markNewsFetched is
 * always called (otherwise the previous success stays on the settings screen and the failure
 * becomes invisible).
 */
export async function fetchVendorNews(
  db: Db,
  vendor: NewsSourceVendor,
  fetchImpl: typeof fetch = fetch,
): Promise<{ added: number; error: string | null }> {
  const outcome = await fetchCandidates(vendor, fetchImpl)
  if ('error' in outcome) {
    await markNewsFetched(db, vendor.id, outcome.error)
    console.log(`news: ${vendor.id} added=0 error=${outcome.error}`)
    return { added: 0, error: outcome.error }
  }

  let added: number
  try {
    const rows: NewNews[] = outcome.candidates.map((c) => {
      const event = extractEvent(`${c.title} ${c.summary ?? ''}`, c.publishedOn)
      return {
        vendorId: vendor.id,
        url: c.url,
        title: c.title,
        summary: c.summary,
        publishedOn: c.publishedOn,
        eventStart: event?.start ?? null,
        eventEnd: event?.end ?? null,
        eventKind: event?.kind ?? null,
      }
    })

    added = await insertNewsIfNew(db, rows)
  } catch (e) {
    const message = errorMessage(e)
    // Even when markNewsFetched itself fails (e.g. the vendor row disappeared at the same time
    // as the fetch), swallow the failure of recording here and always return the value and
    // log below.
    await markNewsFetched(db, vendor.id, message).catch(() => {})
    console.log(`news: ${vendor.id} added=0 error=${message}`)
    return { added: 0, error: message }
  }

  // By this point the insert (insertNewsIfNew) itself has succeeded. added is returned
  // reliably regardless of whether the following markNewsFetched succeeds (this prevents the
  // result turning into "0 items" because only the final recording failed although the
  // import is done).
  try {
    await markNewsFetched(db, vendor.id, null)
  } catch (e) {
    const message = errorMessage(e)
    await markNewsFetched(db, vendor.id, message).catch(() => {})
    console.log(`news: ${vendor.id} added=${added} error=markNewsFetched failed: ${message}`)
    return { added, error: message }
  }

  console.log(`news: ${vendor.id} added=${added} error=null`)
  return { added, error: null }
}

export type FetchAllVendorNewsResult = {
  vendorId: string
  /** The vendor name is returned too, so the caller (the settings screen) need not show the UUID as is */
  vendorName: string
  added: number
  error: string | null
}

/**
 * Fetches every vendor that has newsUrl set, in order. The failure of 1 vendor (including
 * the case where fetchVendorNews throws an unexpected exception) does not stop the fetch for
 * the other vendors.
 */
export async function fetchAllVendorNews(
  db: Db,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchAllVendorNewsResult[]> {
  const sources = await listNewsSources(db)
  const results: FetchAllVendorNewsResult[] = []
  for (const vendor of sources) {
    try {
      const { added, error } = await fetchVendorNews(db, vendor, fetchImpl)
      results.push({ vendorId: vendor.id, vendorName: vendor.name, added, error })
    } catch (e) {
      const message = errorMessage(e)
      console.log(`news: ${vendor.id} added=0 error=${message}`)
      results.push({ vendorId: vendor.id, vendorName: vendor.name, added: 0, error: message })
    }
  }
  return results
}
