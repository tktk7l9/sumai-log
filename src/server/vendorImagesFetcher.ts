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
/** 手動アップロードの上限（design 通り 512KB）。自動取得の ICON_MAX_BYTES と値は同じだが、
 * 「サイトから取得するアイコン」と「フォームからアップロードされたファイル」は別の予算
 * として意図的に定数を分けている（将来どちらかだけ変えたくなったときに独立して変えられる）。 */
export const FAVICON_UPLOAD_MAX_BYTES = 512_000
export const FAVICON_UPLOAD_TOO_LARGE_ERROR = `画像が大きすぎます（上限 ${FAVICON_UPLOAD_MAX_BYTES / 1000}KB）`
export const FAVICON_UPLOAD_WRONG_TYPE_ERROR =
  '画像ファイルではありません（PNG/JPEG/WebP/ICO のみ）'
/** pickFaviconCandidates が返す配列は最大 6 件（宣言 5 + favicon.ico の保険）だが、
 * 呼び出し側でも明示的に切って外向き fetch 数（HTML 1 + アイコン最大 6 = 最大 7）を保証する。 */
const MAX_FAVICON_CANDIDATES_TO_TRY = 6
/** 設定画面「アイコンを取得」からの呼び出しは、この既定の予算をそのまま使う */
const DEFAULT_FAVICON_BUDGET: Required<FaviconFetchBudget> = {
  htmlTimeoutMs: HTML_TIMEOUT_MS,
  iconTimeoutMs: ICON_TIMEOUT_MS,
  maxCandidates: MAX_FAVICON_CANDIDATES_TO_TRY,
}
/**
 * saveVendor（candidates.ts）が保存のたびに inline で待つ分だけの、うんと短い予算。
 * HTML 4s + 候補最大 2 件 × 2s = 最悪 8s。保存を長時間ブロックしないための上限で、
 * ここで見つからなくても設定画面の「アイコンを取得」（既定の予算）が拾える。
 * （リダイレクトが hop ごとにこの秒数を使うため、hop が続く極端なケースでは
 * 合計がこれを超えうるが、通常の 0〜1 hop では合計 ≤8s に収まる）
 */
export const SAVE_FAVICON_BUDGET: FaviconFetchBudget = {
  htmlTimeoutMs: 4_000,
  iconTimeoutMs: 2_000,
  maxCandidates: 2,
}
/** 設定画面「アイコンを取得」/「取り直す」1 回の呼び出しで処理する業者数の上限。
 * 業者 1 件で最悪 HTML 1 回 + 候補最大 6 回 = 7 回の外向き fetch（:142 で保証）を
 * 直列に行うため、無制限に回すとサブリクエスト数・応答時間の両方が業者数に比例して
 * 際限なく伸びる。超えたぶんは remaining で返し、UI から「もう一度押す」で続きを処理する。 */
const MAX_VENDORS_PER_REFRESH_CALL = 10

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

/** fetchFaviconForVendor の呼び出し元ごとに変える外向き fetch の予算。省略した項目は
 * 既定の予算（設定画面「アイコンを取得」と同じ、フル）を使う。 */
export type FaviconFetchBudget = {
  htmlTimeoutMs?: number
  iconTimeoutMs?: number
  maxCandidates?: number
}

/**
 * 1 業者ぶんファビコンを取得して R2 に置き、favicon_key を更新する。
 * 例外は投げない（design 通り）。候補を順に試し、画像として sniff できた最初の 1 件を使う。
 * 鍵には stamp（base36 の Date.now()）を挟むので、差し替えのたびに新しい URL になる
 * （配信は immutable キャッシュなので、同じ URL のままだと差し替えが反映されない）。
 * 前の favicon_key（差し替え前の値）は必ず削除する（stamp が違えば常に別キーになるため）。
 */
export async function fetchFaviconForVendor(
  db: Db,
  vendorId: string,
  websiteUrl: string,
  fetchImpl: typeof fetch = fetch,
  bucket: R2Bucket = getPhotosBucket(),
  budget: FaviconFetchBudget = {},
  // stamp 生成用。既定は実時計（Date.now）。テストで「差し替えたら鍵が変わる」ことを
  // 検証するとき、同一ミリ秒内に 2 回呼ぶと実時計では偶然同じ stamp になりうるため、
  // 注入できるようにしてある（fetchImpl/bucket と同じ DI の流儀）。
  now: () => number = Date.now,
): Promise<FaviconFetchResult> {
  const htmlTimeoutMs = budget.htmlTimeoutMs ?? DEFAULT_FAVICON_BUDGET.htmlTimeoutMs
  const iconTimeoutMs = budget.iconTimeoutMs ?? DEFAULT_FAVICON_BUDGET.iconTimeoutMs
  const maxCandidates = budget.maxCandidates ?? DEFAULT_FAVICON_BUDGET.maxCandidates
  try {
    if (!isAllowedRemoteUrl(websiteUrl)) return { ok: false, error: 'URL が許可されていません' }

    const htmlResult = await fetchCapped(websiteUrl, fetchImpl, htmlTimeoutMs, HTML_MAX_BYTES)
    const html = htmlResult ? new TextDecoder('utf-8').decode(htmlResult.bytes) : ''
    // 相対 href は実際に本文を返した最終的な URL（リダイレクト後）基準で解決する
    // （newsFetcher.ts の finalUrl と同じ理由）。取得自体に失敗したら websiteUrl のまま。
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
  /** 今回の呼び出しで実際に処理した件数 */
  processed: number
  /** 対象のうち今回処理しなかった件数。0 より大きければ「もう一度押す」で続きを処理できる */
  remaining: number
}

/**
 * favicon_key に埋め込まれた stamp（`favicon-{stamp}.<ext>`）から取得時刻（ミリ秒）を読む。
 * 未取得（null）・旧形式（stamp 無し）はどちらも「最も古い」＝最優先で扱う
 * （refreshAllVendorFavicons の oldest-first 判定用。取得時刻を別列で持たずに済む）。
 */
function faviconStampMs(faviconKey: string | null): number {
  if (!faviconKey) return 0
  const m = /\/favicon-([0-9a-z]+)\./.exec(faviconKey)
  if (!m) return 0
  const parsed = Number.parseInt(m[1], 36)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * website_url がある業者を対象にファビコンを取得する。`force` が false なら
 * 既に favicon_key がある業者は対象外（design 通り）。1 社の失敗は次の業者を止めない。
 *
 * `force` が false のときは `favicon_source = 'manual'`（業者フォームからの手動アップロード）
 * の業者も対象外にする: 手動アップロードは常に favicon_key を持つため、実際には
 * 「favicon_key が無い業者だけ」というだけで既に除外されているが、由来を明示的に見て
 * 除外することで「たまたま key が無いから除外されている」という偶然の防御ではなく
 * 意図した仕様として自己文書化する。`force` が true（「取り直す」）のときは手動アップロード
 * も対象に含める（design 通り: 手動アップロードは自動更新から保護されるが、明示的な
 * 「取り直す」操作までは止めない）。
 *
 * 1 回の呼び出しで処理するのは最大 MAX_VENDORS_PER_REFRESH_CALL（10）社まで
 * （業者 1 件で最悪 7 回の外向き fetch を直列に行うため、無制限だと応答時間・
 * サブリクエスト数が業者数に比例して際限なく伸びる）。`force` が false のときは
 * 対象がそもそも「未取得」だけなので処理順は先着順、`force` が true（取り直す）
 * のときは favicon_key の stamp が古い（＝最後に取得してから時間が経っている、
 * または未取得の）業者から優先する。処理しきれなかった分は `remaining` で返し、
 * 設定画面から「もう一度押す」ことで続きを拾える（次回はその 10 社の stamp が
 * 新しくなっているので、自然に次の 10 社へ順番が回る）。
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
  // stamp 生成用。既定は実時計（fetchFaviconForVendor と同じ DI の理由）。
  now: () => number = Date.now,
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
    // 消す対象のキーは vendorId だけからは分からない（stamp を含むため）。
    // 差し替え前の値として DB に保存されている実際のキーを読んでから消す。
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
 * サイトのアイコンを業者フォームから手動アップロードする（design 背景: Cloudflare からの
 * アクセスを一律拒否するサーバーがあり、自動取得（fetchFaviconForVendor）が届かないため）。
 * アップロード経路（src/routes/api.vendor-favicon.$vendorId.tsx）は multipart を
 * パースして bytes を取り出すだけで、検証・R2 書き込み・DB 更新はここに集約する
 * （vendorImagesFetcher.worker-test.ts から HTTP 層を経由せず直接テストできるように。
 * ファイル分割の理由はファイル先頭のコメント参照）。
 *
 * 許可する画像形式は自動取得と同じ（sniffFaviconType。SVG は含めない — stored XSS 対策は
 * src/lib/favicon.ts のコメント参照）。favicon_source を 'manual' にすることで、以後
 * 非 force の自動更新（refreshAllVendorFavicons・saveVendor 保存時のインライン取得）から
 * 除外される（「取り直す」= force はこの限りでない）。
 */
export async function uploadVendorFaviconCore(
  db: Db,
  vendorId: string,
  bytes: Uint8Array,
  bucket: R2Bucket = getPhotosBucket(),
  // stamp 生成用。既定は実時計（fetchFaviconForVendor と同じ DI の理由）。
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
 * favicon_key / favicon_source を両方 NULL にし、R2 のファビコンオブジェクトも消す
 * （業者フォームの「削除」ボタン用。自動取得・手動アップロードのどちらのキーでも同じ扱い）。
 * 業者が実在しない id には何もしない（存在確認は deleteRepresentativePhotoObjects と同じ理由）。
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
