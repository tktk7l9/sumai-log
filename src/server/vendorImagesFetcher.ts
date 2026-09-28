/**
 * The actual work of fetching the favicon of a vendor's site and of the representative's
 * face photo (import from URL, delete).
 * The file is split for the same reason as newsFetcher.ts: by placing only plain functions
 * that are not wrapped in createServerFn,
 *  1. they can be called directly from vendorImagesFetcher.worker-test.ts (not subject to
 *     the No Start context restriction)
 *  2. server-only code around R2/fetch does not leak into the client bundle
 *     (if it lived together with the createServerFn wrappers in vendorImages.ts, then on
 *     import from the client the imports of this file (`cloudflare:workers` in storage.ts
 *     etc.) get pulled into the build, cannot be resolved, and the build fails. We actually
 *     hit this)
 * The createServerFn wrappers live on the vendorImages.ts side.
 */

import type { Db } from '../db/client'
import { extForType, pickFaviconCandidates, sniffFaviconType } from '../lib/favicon'
import { isAllowedRemoteUrl } from '../lib/news/url'
import {
  MAX_IMPORTED_PHOTO_BYTES,
  representativeThumbKeyFromDisplayKey,
  sniffImageType,
  vendorFaviconKey,
  vendorImageKeys,
} from '../lib/photos'
import {
  listVendorsWithWebsite,
  setVendorFaviconKey,
  setVendorRepresentativePhotoKey,
  vendorExists,
} from './repository'
import { fetchWithGuardedRedirects } from './safeFetch'
import { deletePhotoObjects, getPhotosBucket } from './storage'

const HTML_TIMEOUT_MS = 8_000
const HTML_MAX_BYTES = 1_000_000
const ICON_TIMEOUT_MS = 5_000
const ICON_MAX_BYTES = 512_000
const PHOTO_TIMEOUT_MS = 10_000
const USER_AGENT = 'sumai-log/1.0'
const ERROR_MESSAGE_MAX = 200
const NO_ICON_FOUND_ERROR = 'アイコンが見つかりませんでした'
const NOT_AN_IMAGE_ERROR = '画像ファイルではありません（JPEG/PNG/WebP のみ）'
export const VENDOR_NOT_FOUND_ERROR = '業者が見つかりません'
/** Upper limit for manual upload (512KB, as in the design). The value is the same as
 * ICON_MAX_BYTES of the automatic fetch, but the constants are split on purpose because
 * "an icon fetched from the site" and "a file uploaded from the form" are separate budgets
 * (if we want to change only one of them in the future, they can change independently). */
export const FAVICON_UPLOAD_MAX_BYTES = 512_000
export const FAVICON_UPLOAD_TOO_LARGE_ERROR = `画像が大きすぎます（上限 ${FAVICON_UPLOAD_MAX_BYTES / 1000}KB）`
export const FAVICON_UPLOAD_WRONG_TYPE_ERROR =
  '画像ファイルではありません（PNG/JPEG/WebP/ICO のみ）'
/** The array returned by pickFaviconCandidates has at most 6 entries (5 declared + the
 * favicon.ico fallback), but the caller also cuts it explicitly to guarantee the number of
 * outbound fetches (HTML 1 + icons at most 6 = at most 7). */
const MAX_FAVICON_CANDIDATES_TO_TRY = 6
/** Calls from "アイコンを取得" (fetch icons) on the settings screen use this default budget as is */
const DEFAULT_FAVICON_BUDGET: Required<FaviconFetchBudget> = {
  htmlTimeoutMs: HTML_TIMEOUT_MS,
  iconTimeoutMs: ICON_TIMEOUT_MS,
  maxCandidates: MAX_FAVICON_CANDIDATES_TO_TRY,
}
/**
 * A much shorter budget, only for what saveVendor (candidates.ts) waits for inline on every
 * save. HTML 4s + at most 2 candidates x 2s = 8s at worst. It is a limit so that saving is
 * not blocked for a long time; even if nothing is found here, "アイコンを取得" on the
 * settings screen (the default budget) can pick it up.
 * (Redirects use this many seconds per hop, so in extreme cases with consecutive hops the
 * total can exceed this, but with the usual 0-1 hops the total stays ≤8s)
 */
export const SAVE_FAVICON_BUDGET: FaviconFetchBudget = {
  htmlTimeoutMs: 4_000,
  iconTimeoutMs: 2_000,
  maxCandidates: 2,
}
/** Upper limit on the number of vendors processed by one call of "アイコンを取得" /
 * "取り直す" (fetch again) on the settings screen.
 * One vendor does at worst HTML 1 time + candidates at most 6 times = 7 outbound fetches
 * (guaranteed at :142) in series, so running without a limit makes both the number of
 * subrequests and the response time grow without bound in proportion to the number of
 * vendors. The excess is returned as remaining, and the UI processes the rest by
 * "pressing once more". */
const MAX_VENDORS_PER_REFRESH_CALL = 10

function errorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : '取得に失敗しました'
  return message.length > ERROR_MESSAGE_MAX ? message.slice(0, ERROR_MESSAGE_MAX) : message
}

/**
 * Reads the response body as raw bytes. Same policy as readCappedBytes in newsFetcher.ts
 * (reject up front if there is a content-length, otherwise count the stream and cut it
 * off), but for favicon/representative photo the limit differs by source (HTML 1MB, icon
 * 512KB, photo 5MB), so maxBytes is taken as an argument.
 */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > maxBytes) return null

  const reader = response.body?.getReader()
  if (!reader) {
    const buf = new Uint8Array(await response.arrayBuffer())
    return buf.byteLength > maxBytes ? null : buf
  }

  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
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

type CappedFetchResult = { bytes: Uint8Array; finalUrl: string }

/**
 * Fetches with `fetchWithGuardedRedirects` (safeFetch.ts, shared with newsFetcher.ts),
 * following redirects only through allowed hops, and reads up to the limit with readCapped.
 * The caller must confirm beforehand that `url` itself passes isAllowedRemoteUrl
 * (because this redirect following looks only at "the 2nd hop onward". The 1st hop = the
 * allow check of url itself is the caller's responsibility. Same division as
 * fetchCandidates in newsFetcher.ts).
 */
async function fetchCapped(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  maxBytes: number,
): Promise<CappedFetchResult | null> {
  const outcome = await fetchWithGuardedRedirects(url, {
    timeoutMs,
    headers: { 'User-Agent': USER_AGENT },
    fetchImpl,
  })
  if ('error' in outcome) return null
  const { response, finalUrl } = outcome
  if (!response.ok) return null
  try {
    const bytes = await readCapped(response, maxBytes)
    return bytes ? { bytes, finalUrl } : null
  } catch {
    return null
  }
}

export type FaviconFetchResult = { ok: true; key: string } | { ok: false; error: string }

/** Outbound fetch budget that changes per caller of fetchFaviconForVendor. Omitted items
 * use the default budget (the same as "アイコンを取得" on the settings screen, full). */
export type FaviconFetchBudget = {
  htmlTimeoutMs?: number
  iconTimeoutMs?: number
  maxCandidates?: number
}

/**
 * Fetches the favicon for 1 vendor, puts it in R2, and updates favicon_key.
 * Does not throw (as in the design). Tries the candidates in order and uses the first one
 * that can be sniffed as an image.
 * The key includes a stamp (Date.now() in base36), so every replacement gets a new URL
 * (serving uses an immutable cache, so with the same URL the replacement would not show).
 * The previous favicon_key (the value before replacement) is always deleted (because a
 * different stamp always makes a different key).
 */
export async function fetchFaviconForVendor(
  db: Db,
  vendorId: string,
  websiteUrl: string,
  fetchImpl: typeof fetch = fetch,
  bucket: R2Bucket = getPhotosBucket(),
  budget: FaviconFetchBudget = {},
  // For generating the stamp. The default is the real clock (Date.now). When a test verifies
  // that "the key changes on replacement", calling twice within the same millisecond can
  // give the same stamp by chance with the real clock, so it is injectable (same DI style
  // as fetchImpl/bucket).
  now: () => number = Date.now,
): Promise<FaviconFetchResult> {
  const htmlTimeoutMs = budget.htmlTimeoutMs ?? DEFAULT_FAVICON_BUDGET.htmlTimeoutMs
  const iconTimeoutMs = budget.iconTimeoutMs ?? DEFAULT_FAVICON_BUDGET.iconTimeoutMs
  const maxCandidates = budget.maxCandidates ?? DEFAULT_FAVICON_BUDGET.maxCandidates
  try {
    if (!isAllowedRemoteUrl(websiteUrl)) return { ok: false, error: 'URL が許可されていません' }

    const htmlResult = await fetchCapped(websiteUrl, fetchImpl, htmlTimeoutMs, HTML_MAX_BYTES)
    const html = htmlResult ? new TextDecoder('utf-8').decode(htmlResult.bytes) : ''
    // Relative hrefs are resolved against the final URL that actually returned the body
    // (after redirects) (same reason as finalUrl in newsFetcher.ts). If the fetch itself
    // failed, websiteUrl is used as is.
    const candidates = pickFaviconCandidates(html, htmlResult?.finalUrl ?? websiteUrl)

    for (const candidateUrl of candidates.slice(0, maxCandidates)) {
      if (!isAllowedRemoteUrl(candidateUrl)) continue
      const iconResult = await fetchCapped(candidateUrl, fetchImpl, iconTimeoutMs, ICON_MAX_BYTES)
      if (!iconResult) continue
      const bytes = iconResult.bytes
      const type = sniffFaviconType(bytes)
      if (!type) continue

      const stamp = now().toString(36)
      const key = vendorFaviconKey(vendorId, extForType(type), stamp)
      await bucket.put(key, bytes, { httpMetadata: { contentType: type } })
      const previousKey = await setVendorFaviconKey(db, vendorId, key, 'auto')
      if (previousKey && previousKey !== key) {
        await deletePhotoObjects([previousKey], bucket).catch(() => {})
      }
      return { ok: true, key }
    }

    return { ok: false, error: NO_ICON_FOUND_ERROR }
  } catch (e) {
    return { ok: false, error: errorMessage(e) }
  }
}

export type RefreshFaviconResult = {
  vendorId: string
  vendorName: string
} & FaviconFetchResult

export type RefreshAllFaviconsResult = {
  results: RefreshFaviconResult[]
  /** Number actually processed in this call */
  processed: number
  /** Number of targets not processed this time. If greater than 0, "pressing once more"
   * processes the rest */
  remaining: number
}

/**
 * Reads the fetch time (milliseconds) from the stamp embedded in favicon_key
 * (`favicon-{stamp}.<ext>`). Not yet fetched (null) and the old format (no stamp) are both
 * treated as "the oldest" = top priority (for the oldest-first decision of
 * refreshAllVendorFavicons. This avoids holding the fetch time in a separate column).
 */
function faviconStampMs(faviconKey: string | null): number {
  if (!faviconKey) return 0
  const m = /\/favicon-([0-9a-z]+)\./.exec(faviconKey)
  if (!m) return 0
  const parsed = Number.parseInt(m[1], 36)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Fetches favicons for vendors that have a website_url. If `force` is false, vendors that
 * already have a favicon_key are excluded (as in the design). A failure of 1 vendor does
 * not stop the next vendor.
 *
 * When `force` is false, vendors with `favicon_source = 'manual'` (manual upload from the
 * vendor form) are also excluded: a manual upload always has a favicon_key, so in practice
 * they are already excluded just by "only vendors without a favicon_key", but excluding
 * them by looking at the source explicitly self-documents this as the intended spec, not
 * an accidental defense of "excluded because it happens to have no key". When `force` is
 * true ("取り直す"), manual uploads are also included (as in the design: manual uploads are
 * protected from automatic updates, but an explicit "取り直す" operation is not stopped).
 *
 * One call processes at most MAX_VENDORS_PER_REFRESH_CALL (10) vendors
 * (one vendor does at worst 7 outbound fetches in series, so without a limit the response
 * time and the number of subrequests grow without bound in proportion to the number of
 * vendors). When `force` is false the targets are only "not yet fetched" in the first
 * place, so the processing order is first come first served; when `force` is true (fetch
 * again), vendors whose favicon_key stamp is old (= time has passed since the last fetch,
 * or not yet fetched) come first. What could not be processed is returned as `remaining`,
 * and "pressing once more" from the settings screen picks up the rest (next time the
 * stamps of those 10 vendors are newer, so the turn naturally moves on to the next 10).
 */
export async function refreshAllVendorFavicons(
  db: Db,
  opts: { force: boolean } = { force: false },
  fetchImpl: typeof fetch = fetch,
  bucket: R2Bucket = getPhotosBucket(),
): Promise<RefreshAllFaviconsResult> {
  const withSite = await listVendorsWithWebsite(db)
  const eligible = withSite.filter(
    (v) => opts.force || (v.faviconKey === null && v.faviconSource !== 'manual'),
  )
  const targets = opts.force
    ? [...eligible].sort((a, b) => faviconStampMs(a.faviconKey) - faviconStampMs(b.faviconKey))
    : eligible
  const toProcess = targets.slice(0, MAX_VENDORS_PER_REFRESH_CALL)
  const remaining = targets.length - toProcess.length

  const results: RefreshFaviconResult[] = []
  for (const v of toProcess) {
    if (!v.websiteUrl) continue
    try {
      const outcome = await fetchFaviconForVendor(db, v.id, v.websiteUrl, fetchImpl, bucket)
      results.push({ vendorId: v.id, vendorName: v.name, ...outcome })
    } catch (e) {
      results.push({ vendorId: v.id, vendorName: v.name, ok: false, error: errorMessage(e) })
    }
  }
  return { results, processed: toProcess.length, remaining }
}

export type ImportPhotoResult = { ok: true; key: string } | { ok: false; error: string }

/**
 * Imports the representative's face photo from a URL. The server (Workers) side has no
 * Canvas, so it cannot downscale: the original fetched bytes are put as is under both the
 * display and thumb R2 keys (a known limitation in the design. Uploads from the form are
 * downscaled with Canvas on the device).
 * Only JPEG/PNG/WebP are allowed (sniffImageType). 5MB limit (MAX_IMPORTED_PHOTO_BYTES).
 */
export async function importRepresentativePhotoFromUrlCore(
  db: Db,
  vendorId: string,
  url: string,
  fetchImpl: typeof fetch = fetch,
  bucket: R2Bucket = getPhotosBucket(),
  // For generating the stamp. The default is the real clock (same DI reason as
  // fetchFaviconForVendor).
  now: () => number = Date.now,
): Promise<ImportPhotoResult> {
  try {
    // Confirm the vendor exists before writing to R2 (writing for a non-existent id leaves
    // orphan objects. Same check as the upload path in api.vendor-photos.$vendorId.tsx)
    if (!(await vendorExists(db, vendorId))) return { ok: false, error: VENDOR_NOT_FOUND_ERROR }
    if (!isAllowedRemoteUrl(url)) return { ok: false, error: 'URL が許可されていません' }

    const photoResult = await fetchCapped(
      url,
      fetchImpl,
      PHOTO_TIMEOUT_MS,
      MAX_IMPORTED_PHOTO_BYTES,
    )
    if (!photoResult)
      return { ok: false, error: '画像を取得できませんでした（取得失敗、または上限 5MB 超過）' }
    const bytes = photoResult.bytes

    const type = sniffImageType(bytes)
    if (!type) return { ok: false, error: NOT_AN_IMAGE_ERROR }

    const stamp = now().toString(36)
    const keys = vendorImageKeys(vendorId, stamp)
    await bucket.put(keys.displayKey, bytes, { httpMetadata: { contentType: type } })
    await bucket.put(keys.thumbKey, bytes, { httpMetadata: { contentType: type } })
    const previousKey = await setVendorRepresentativePhotoKey(db, vendorId, keys.displayKey)
    if (previousKey && previousKey !== keys.displayKey) {
      const previousThumbKey = representativeThumbKeyFromDisplayKey(previousKey)
      await deletePhotoObjects([previousKey, previousThumbKey], bucket).catch(() => {})
    }
    return { ok: true, key: keys.displayKey }
  } catch (e) {
    return { ok: false, error: errorMessage(e) }
  }
}

export type DeletePhotoResult = { ok: true } | { ok: false; error: string }

/**
 * Clears representative_photo_key and also deletes the display/thumb objects in R2.
 * Does nothing for an id whose vendor does not exist (the existence check has the same
 * reason as importRepresentativePhotoFromUrlCore).
 */
export async function deleteRepresentativePhotoObjects(
  db: Db,
  vendorId: string,
  bucket: R2Bucket = getPhotosBucket(),
): Promise<DeletePhotoResult> {
  try {
    if (!(await vendorExists(db, vendorId))) return { ok: false, error: VENDOR_NOT_FOUND_ERROR }
    // The key to delete cannot be known from vendorId alone (because it includes the stamp).
    // Read the actual key stored in the DB as the pre-replacement value, then delete.
    const previousKey = await setVendorRepresentativePhotoKey(db, vendorId, null)
    if (previousKey) {
      const previousThumbKey = representativeThumbKeyFromDisplayKey(previousKey)
      await deletePhotoObjects([previousKey, previousThumbKey], bucket)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errorMessage(e) }
  }
}

export type UploadFaviconResult = { ok: true; key: string } | { ok: false; error: string }

/**
 * Manually uploads the site icon from the vendor form (design background: some servers
 * reject all access from Cloudflare, so the automatic fetch (fetchFaviconForVendor) cannot
 * reach them).
 * The upload path (src/routes/api.vendor-favicon.$vendorId.tsx) only parses the multipart
 * and takes out the bytes; validation, the R2 write and the DB update are gathered here
 * (so that vendorImagesFetcher.worker-test.ts can test directly without going through the
 * HTTP layer. See the comment at the top of the file for why the files are split).
 *
 * The allowed image formats are the same as the automatic fetch (sniffFaviconType. SVG is
 * not included — for the stored XSS protection see the comment in src/lib/favicon.ts).
 * Setting favicon_source to 'manual' excludes the vendor from later non-force automatic
 * updates (refreshAllVendorFavicons, the inline fetch when saveVendor saves) ("取り直す" =
 * force is not subject to this).
 */
export async function uploadVendorFaviconCore(
  db: Db,
  vendorId: string,
  bytes: Uint8Array,
  bucket: R2Bucket = getPhotosBucket(),
  // For generating the stamp. The default is the real clock (same DI reason as
  // fetchFaviconForVendor).
  now: () => number = Date.now,
): Promise<UploadFaviconResult> {
  try {
    if (!(await vendorExists(db, vendorId))) return { ok: false, error: VENDOR_NOT_FOUND_ERROR }
    if (bytes.byteLength === 0 || bytes.byteLength > FAVICON_UPLOAD_MAX_BYTES) {
      return { ok: false, error: FAVICON_UPLOAD_TOO_LARGE_ERROR }
    }
    const type = sniffFaviconType(bytes)
    if (!type) return { ok: false, error: FAVICON_UPLOAD_WRONG_TYPE_ERROR }

    const stamp = now().toString(36)
    const key = vendorFaviconKey(vendorId, extForType(type), stamp)
    await bucket.put(key, bytes, { httpMetadata: { contentType: type } })
    const previousKey = await setVendorFaviconKey(db, vendorId, key, 'manual')
    if (previousKey && previousKey !== key) {
      await deletePhotoObjects([previousKey], bucket).catch(() => {})
    }
    return { ok: true, key }
  } catch (e) {
    return { ok: false, error: errorMessage(e) }
  }
}

export type DeleteFaviconResult = { ok: true } | { ok: false; error: string }

/**
 * Sets both favicon_key / favicon_source to NULL and also deletes the favicon object in R2
 * (for the "削除" (delete) button in the vendor form. Keys from the automatic fetch and
 * from manual upload are treated the same).
 * Does nothing for an id whose vendor does not exist (the existence check has the same
 * reason as deleteRepresentativePhotoObjects).
 */
export async function deleteVendorFaviconObjects(
  db: Db,
  vendorId: string,
  bucket: R2Bucket = getPhotosBucket(),
): Promise<DeleteFaviconResult> {
  try {
    if (!(await vendorExists(db, vendorId))) return { ok: false, error: VENDOR_NOT_FOUND_ERROR }
    const previousKey = await setVendorFaviconKey(db, vendorId, null, null)
    if (previousKey) {
      await deletePhotoObjects([previousKey], bucket)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errorMessage(e) }
  }
}
