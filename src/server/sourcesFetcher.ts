/**
 * The real work of the "取得" (Fetch) button of the source form. The file is split for the
 * same reason as newsFetcher.ts / vendorImagesFetcher.ts: by placing only plain functions
 * not wrapped in createServerFn, they can be called directly from
 * sourcesFetcher.worker-test.ts (not subject to the No Start context restriction). The
 * createServerFn wrapper lives on the sources.ts side.
 *
 * Targets only YouTube channel URLs (per the brief). Fetching <title>/og:description/
 * favicon of other sites is not done here (it is separate from the vendor favicon fetch
 * pipeline of Task 6, and "取得" for sources is limited to YouTube channels).
 */

import { isAllowedRemoteUrl } from '../lib/news/url'
import { isAllowedAvatarUrl, parseYoutubeChannelUrl } from '../lib/sources'
import { extractYoutubeMeta } from '../lib/sources/youtubeMeta'
import { fetchWithGuardedRedirects } from './safeFetch'

const FETCH_TIMEOUT_MS = 10_000
const MAX_HTML_BYTES = 1_000_000
const USER_AGENT = 'sumai-log/1.0'
const ERROR_MESSAGE_MAX = 200
const NOT_YOUTUBE_ERROR =
  'YouTube チャンネルの URL のみ自動取得できます（例: https://www.youtube.com/@channel）。手入力してください'
const URL_NOT_ALLOWED_ERROR = 'URL が許可されていません'

function errorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : '取得に失敗しました'
  return message.length > ERROR_MESSAGE_MAX ? message.slice(0, ERROR_MESSAGE_MAX) : message
}

/**
 * Reads **only the first maxBytes** of the response body. `<meta>` such as og:title
 * normally appears in `<head>` (the top of the page), so even if the whole page exceeds
 * maxBytes, being able to read the top is enough for extraction. The policy differs from
 * readCappedBytes in newsFetcher.ts / readCapped in vendorImagesFetcher.ts (both turn
 * exceeding the limit into a "fetch failure"); here **exceeding the size is not an
 * error**: the stream is cut off (`reader.cancel()`) once the first maxBytes have been
 * read, and only what was read is returned. The content-length header is not looked at
 * (the top should be read even when the page is known to be large). The return value is
 * always a Uint8Array (never null).
 */
async function readPrefix(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) {
    const buf = new Uint8Array(await response.arrayBuffer())
    return buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf
  }

  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    const remaining = maxBytes - total
    if (remaining <= 0) {
      await reader.cancel().catch(() => {})
      break
    }
    const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value
    chunks.push(slice)
    total += slice.byteLength
    if (total >= maxBytes) {
      await reader.cancel().catch(() => {})
      break
    }
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

export type ResolveSourceFields = {
  name: string | null
  description: string | null
  avatarUrl: string | null
  handle: string | null
  channelId: string | null
}

export type ResolveSourceResult =
  { ok: true; fields: ResolveSourceFields } | { ok: false; error: string }

/**
 * If the URL is not in YouTube channel form (parseYoutubeChannelUrl in src/lib/sources.ts),
 * returns an error immediately. Otherwise, after passing the SSRF guard
 * isAllowedRemoteUrl, fetches the page with `fetchWithGuardedRedirects` (10 second
 * timeout, manual redirect following), reads only the first 1MB (`readPrefix`) and
 * extracts og:title/og:description/og:image/channelId (youtubeMeta.ts). Even if the whole
 * page exceeds 1MB, extraction works as long as `<head>` fits in the top, and it is not a
 * failure (so that "取得" can be used even on larger real channel pages).
 * handle/channelId known from the URL path itself take priority, and if missing they are
 * filled in with the values extracted from the page. Does not throw (per the design).
 */
export async function resolveSourceCore(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolveSourceResult> {
  const parsed = parseYoutubeChannelUrl(url)
  if (!parsed) return { ok: false, error: NOT_YOUTUBE_ERROR }
  if (!isAllowedRemoteUrl(url)) return { ok: false, error: URL_NOT_ALLOWED_ERROR }

  try {
    const outcome = await fetchWithGuardedRedirects(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      headers: { 'Accept-Language': 'ja', Cookie: 'CONSENT=YES+1', 'User-Agent': USER_AGENT },
      fetchImpl,
    })
    if ('error' in outcome) return { ok: false, error: outcome.error }
    if (!outcome.response.ok) return { ok: false, error: `HTTP ${outcome.response.status}` }

    const bytes = await readPrefix(outcome.response, MAX_HTML_BYTES)
    const html = new TextDecoder('utf-8').decode(bytes)
    const meta = extractYoutubeMeta(html)
    const avatarUrl = meta.imageUrl && isAllowedAvatarUrl(meta.imageUrl) ? meta.imageUrl : null
    const channelId = ('channelId' in parsed ? parsed.channelId : null) ?? meta.channelId
    const handle = 'handle' in parsed ? parsed.handle : null

    return {
      ok: true,
      fields: { name: meta.title, description: meta.description, avatarUrl, handle, channelId },
    }
  } catch (e) {
    return { ok: false, error: errorMessage(e) }
  }
}
