/**
 * 業者のサイトのファビコン取得・代表者の顔写真（URL 取り込み・削除）の実処理。
 * newsFetcher.ts と同じ理由でファイルを分けている: createServerFn でラップしていない
 * 素の関数だけを置くことで、
 *  1. vendorImagesFetcher.worker-test.ts から直接呼べる（No Start context の制約を受けない）
 *  2. クライアントバンドルへ R2/fetch まわりのサーバー専用コードが漏れない
 *     （vendorImages.ts に createServerFn ラッパーと同居させると、クライアントから
 *     import した際に本ファイルの import（storage.ts の `cloudflare:workers` 等）が
 *     ビルドに巻き込まれて解決できずビルドが失敗する。実際に踏んだ）
 * createServerFn のラッパーは vendorImages.ts 側に置く。
 */

import type { Db } from '../db/client'
import { extForType, pickFaviconCandidates, sniffFaviconType } from '../lib/favicon'
import { isAllowedRemoteUrl } from '../lib/news/url'
import {
  MAX_IMPORTED_PHOTO_BYTES,
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
const VENDOR_NOT_FOUND_ERROR = '業者が見つかりません'
/** pickFaviconCandidates が返す配列は最大 6 件（宣言 5 + favicon.ico の保険）だが、
 * 呼び出し側でも明示的に切って外向き fetch 数（HTML 1 + アイコン最大 6 = 最大 7）を保証する。 */
const MAX_FAVICON_CANDIDATES_TO_TRY = 6

function errorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : '取得に失敗しました'
  return message.length > ERROR_MESSAGE_MAX ? message.slice(0, ERROR_MESSAGE_MAX) : message
}

/**
 * レスポンス本文をバイト列のまま読む。newsFetcher.ts の readCappedBytes と同じ方針
 * （content-length があれば先に弾く、無ければストリームを数えながら打ち切る）だが、
 * favicon/代表者写真は上限がソースによって異なる（HTML 1MB・アイコン 512KB・写真 5MB）ため
 * maxBytes を引数で受ける。
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
 * `fetchWithGuardedRedirects`（safeFetch.ts。newsFetcher.ts と共有）でリダイレクトを
 * 許可された hop だけ追いつつ取得し、readCapped で上限まで読む。呼び出し元は
 * `url` 自体が isAllowedRemoteUrl を通っていることを先に確認しておくこと
 * （このリダイレクト追従は「2 hop 目以降」だけを見るため。1 hop 目 = url 自体の
 * 許可判定は呼び出し元の責務。newsFetcher.ts の fetchCandidates と同じ分担）。
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

/**
 * 1 業者ぶんファビコンを取得して R2 に置き、favicon_key を更新する。
 * 例外は投げない（design 通り）。候補を順に試し、画像として sniff できた最初の 1 件を使う。
 * キーが変わった（拡張子違い等）場合は前のオブジェクトを消す。
 */
export async function fetchFaviconForVendor(
  db: Db,
  vendorId: string,
  websiteUrl: string,
  fetchImpl: typeof fetch = fetch,
  bucket: R2Bucket = getPhotosBucket(),
): Promise<FaviconFetchResult> {
  try {
    if (!isAllowedRemoteUrl(websiteUrl)) return { ok: false, error: 'URL が許可されていません' }

    const htmlResult = await fetchCapped(websiteUrl, fetchImpl, HTML_TIMEOUT_MS, HTML_MAX_BYTES)
    const html = htmlResult ? new TextDecoder('utf-8').decode(htmlResult.bytes) : ''
    // 相対 href は実際に本文を返した最終的な URL（リダイレクト後）基準で解決する
    // （newsFetcher.ts の finalUrl と同じ理由）。取得自体に失敗したら websiteUrl のまま。
    const candidates = pickFaviconCandidates(html, htmlResult?.finalUrl ?? websiteUrl)

    for (const candidateUrl of candidates.slice(0, MAX_FAVICON_CANDIDATES_TO_TRY)) {
      if (!isAllowedRemoteUrl(candidateUrl)) continue
      const iconResult = await fetchCapped(candidateUrl, fetchImpl, ICON_TIMEOUT_MS, ICON_MAX_BYTES)
      if (!iconResult) continue
      const bytes = iconResult.bytes
      const type = sniffFaviconType(bytes)
      if (!type) continue

      const key = vendorFaviconKey(vendorId, extForType(type))
      await bucket.put(key, bytes, { httpMetadata: { contentType: type } })
      const previousKey = await setVendorFaviconKey(db, vendorId, key)
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

/**
 * website_url がある全業者を対象にファビコンを取得する。`force` が false なら
 * 既に favicon_key がある業者は対象外（design 通り）。1 社の失敗は次の業者を止めない。
 */
export async function refreshAllVendorFavicons(
  db: Db,
  opts: { force: boolean } = { force: false },
  fetchImpl: typeof fetch = fetch,
  bucket: R2Bucket = getPhotosBucket(),
): Promise<RefreshFaviconResult[]> {
  const withSite = await listVendorsWithWebsite(db)
  const targets = withSite.filter((v) => opts.force || v.faviconKey === null)

  const results: RefreshFaviconResult[] = []
  for (const v of targets) {
    if (!v.websiteUrl) continue
    try {
      const outcome = await fetchFaviconForVendor(db, v.id, v.websiteUrl, fetchImpl, bucket)
      results.push({ vendorId: v.id, vendorName: v.name, ...outcome })
    } catch (e) {
      results.push({ vendorId: v.id, vendorName: v.name, ok: false, error: errorMessage(e) })
    }
  }
  return results
}

export type ImportPhotoResult = { ok: true; key: string } | { ok: false; error: string }

/**
 * 代表者の顔写真を URL から取り込む。サーバー（Workers）側に Canvas が無いため
 * 縮小はできない: 取得した元のバイト列をそのまま display/thumb 両方の R2 キーへ置く
 * （design の既知の限界。フォームからのアップロードは端末側 Canvas で縮小する）。
 * JPEG/PNG/WebP のみ許可（sniffImageType）。5MB 上限（MAX_IMPORTED_PHOTO_BYTES）。
 */
export async function importRepresentativePhotoFromUrlCore(
  db: Db,
  vendorId: string,
  url: string,
  fetchImpl: typeof fetch = fetch,
  bucket: R2Bucket = getPhotosBucket(),
): Promise<ImportPhotoResult> {
  try {
    // R2 へ書く前に業者の実在を確認する（存在しない id に書くと孤児オブジェクトが残る。
    // api.vendor-photos.$vendorId.tsx のアップロード経路と同じ判定）
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

    const keys = vendorImageKeys(vendorId)
    await bucket.put(keys.displayKey, bytes, { httpMetadata: { contentType: type } })
    await bucket.put(keys.thumbKey, bytes, { httpMetadata: { contentType: type } })
    await setVendorRepresentativePhotoKey(db, vendorId, keys.displayKey)
    return { ok: true, key: keys.displayKey }
  } catch (e) {
    return { ok: false, error: errorMessage(e) }
  }
}

export type DeletePhotoResult = { ok: true } | { ok: false; error: string }

/**
 * representative_photo_key を消し、R2 の display/thumb オブジェクトも消す。
 * 業者が実在しない id には何もしない（存在確認は importRepresentativePhotoFromUrlCore と同じ理由）。
 */
export async function deleteRepresentativePhotoObjects(
  db: Db,
  vendorId: string,
  bucket: R2Bucket = getPhotosBucket(),
): Promise<DeletePhotoResult> {
  try {
    if (!(await vendorExists(db, vendorId))) return { ok: false, error: VENDOR_NOT_FOUND_ERROR }
    await setVendorRepresentativePhotoKey(db, vendorId, null)
    const keys = vendorImageKeys(vendorId)
    await deletePhotoObjects([keys.displayKey, keys.thumbKey], bucket)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errorMessage(e) }
  }
}
