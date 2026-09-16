import type { FaviconExt } from './favicon'

/**
 * 写真の R2 キーと受け取り検査。R2 は非公開で、配信は認証後に Worker が
 * ストリームする。キーは `photos/{visitId}/{photoId}-display.jpg` と `-thumb.jpg`。
 * seed 取込（scripts/lib/seed.mjs）も同じ形で置くので、ここを変えたらそちらも変える。
 *
 * 業者の代表者の顔写真・サイトのファビコンも同じ R2 バケットに `vendors/{vendorId}/…`
 * として置く（vendorImageKeys / vendorFaviconKey）。配信（api.photos.$.tsx）は全キーに
 * `immutable` で 1 年キャッシュするため、差し替え時に古い画像が出続けないよう鍵に
 * `stamp`（呼び出し側が渡す base36 の `Date.now()`）を挟んで毎回別の URL にする
 * （最終レビュー Must #1 対応）。DB（vendors.representative_photo_key / favicon_key）には
 * 実際に置いたキーをそのまま保存し、次に使う鍵は常にそこから読む（vendorId だけからは
 * 現在の stamp が分からない）。サムネ（-thumb.jpg）は保存した display キーの末尾を
 * 置き換えるだけで求まるので別列は持たない（representativeThumbKeyFromDisplayKey）。
 *
 * 後方互換: このスキーマを入れる前に保存された鍵（stamp 無しの
 * `representative-display.jpg` / `favicon.<ext>`）も `isManagedPhotoKey` は許可し続ける
 * （既存行がそのまま配信できるように）。
 */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
export const MAX_PHOTOS_PER_UPLOAD = 20
export const MAX_EDGE_PX = 8000
/** URL から代表者の顔写真を取り込むときの上限（design 通り 5MB） */
export const MAX_IMPORTED_PHOTO_BYTES = 5 * 1024 * 1024

const UUIDISH = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
/** base36（Date.now().toString(36)）の stamp。旧形式との違いはこの部分の有無だけ */
const STAMP = '[0-9a-z]+'
const MANAGED_PHOTO = new RegExp(`^photos/${UUIDISH}/${UUIDISH}-(display|thumb)\\.jpg$`)
// 末尾に `-{stamp}` が付いた新形式・付かない旧形式の両方を許可する
const MANAGED_VENDOR_REPRESENTATIVE = new RegExp(
  `^vendors/${UUIDISH}/representative-(${STAMP}-)?(display|thumb)\\.jpg$`,
)
// svg は含めない（src/lib/favicon.ts の FaviconExt/FaviconMimeType のコメント参照。
// SVG を画像として受け付けない設計のため favicon.svg キーは作られない）
const FAVICON_EXTS = ['png', 'ico', 'jpg', 'webp'] as const
const MANAGED_VENDOR_FAVICON = new RegExp(
  `^vendors/${UUIDISH}/favicon(-${STAMP})?\\.(${FAVICON_EXTS.join('|')})$`,
)

export function photoKeys(
  visitId: string,
  photoId: string,
): { displayKey: string; thumbKey: string } {
  return {
    displayKey: `photos/${visitId}/${photoId}-display.jpg`,
    thumbKey: `photos/${visitId}/${photoId}-thumb.jpg`,
  }
}

/**
 * 業者の代表者の顔写真。`stamp`（呼び出し側が渡す base36 の `Date.now()`）を挟むことで、
 * 同じ vendorId でも差し替えるたびに違う URL になる（immutable キャッシュ対策）。
 */
export function vendorImageKeys(
  vendorId: string,
  stamp: string,
): { displayKey: string; thumbKey: string } {
  return {
    displayKey: `vendors/${vendorId}/representative-${stamp}-display.jpg`,
    thumbKey: `vendors/${vendorId}/representative-${stamp}-thumb.jpg`,
  }
}

/**
 * 保存済みの display キー（DB の representative_photo_key）から、対になる thumb キーを導く。
 * display/thumb は同じ stamp で作るので、末尾の `-display.jpg` を `-thumb.jpg` に
 * 置き換えるだけで求まる（新形式・旧形式のどちらの鍵でも同じ規則で導ける）。
 * vendorId だけからは現在の stamp が分からないため、呼び出し側は必ず DB に保存された
 * 実際のキーを渡すこと。
 */
export function representativeThumbKeyFromDisplayKey(displayKey: string): string {
  return displayKey.replace(/-display\.jpg$/, '-thumb.jpg')
}

/** 業者サイトのファビコン。拡張子はサイトごとに変わる（png/ico/jpg/webp。SVG を含めない
 * 理由は src/lib/favicon.ts の FaviconExt/FaviconMimeType のコメント参照）。
 * `stamp` の理由は vendorImageKeys と同じ（immutable キャッシュ対策）。 */
export function vendorFaviconKey(vendorId: string, ext: FaviconExt, stamp: string): string {
  return `vendors/${vendorId}/favicon-${stamp}.${ext}`
}

export function isManagedPhotoKey(key: string): boolean {
  // 以下の正規表現は multiline フラグを付けていないので $ は「入力の末尾」にしか
  // マッチせず、末尾に改行が付いた文字列は本来どれも false になるはずだが、
  // 鍵の許可判定という性質上「$ が改行の直前にもマッチしうる」他の正規表現実装との
  // 混同を避けるため、改行を含む時点で明示的に弾く（意図を自己文書化する防御）。
  if (key.includes('\n')) return false
  return (
    MANAGED_PHOTO.test(key) ||
    MANAGED_VENDOR_REPRESENTATIVE.test(key) ||
    MANAGED_VENDOR_FAVICON.test(key)
  )
}

/** 配信ルート（GET /api/photos/<key>）の URL。ルート側が photos/ を付け直す */
export function photoUrl(key: string): string {
  return `/api/photos/${key.replace(/^photos\//, '')}`
}

export function sniffImageType(
  bytes: Uint8Array,
): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (png.every((b, i) => bytes[i] === b)) return 'image/png'
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}

export function validatePhotoUpload(input: {
  displaySize: number
  thumbSize: number
  width: number
  height: number
}): { status: 400 | 413; message: string } | null {
  if (input.displaySize <= 0 || input.thumbSize <= 0) {
    return { status: 400, message: '画像が空です' }
  }
  if (input.displaySize > MAX_PHOTO_BYTES || input.thumbSize > MAX_PHOTO_BYTES) {
    return {
      status: 413,
      message: `画像が大きすぎます（上限 ${MAX_PHOTO_BYTES / 1024 / 1024}MB）`,
    }
  }
  for (const n of [input.width, input.height]) {
    if (!Number.isInteger(n) || n < 1 || n > MAX_EDGE_PX) {
      return { status: 400, message: '画像の寸法が不正です' }
    }
  }
  return null
}
