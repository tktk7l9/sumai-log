import type { FaviconExt } from './favicon'

/**
 * 写真の R2 キーと受け取り検査。R2 は非公開で、配信は認証後に Worker が
 * ストリームする。キーは `photos/{visitId}/{photoId}-display.jpg` と `-thumb.jpg`。
 * seed 取込（scripts/lib/seed.mjs）も同じ形で置くので、ここを変えたらそちらも変える。
 *
 * 業者の代表者の顔写真・サイトのファビコンも同じ R2 バケットに `vendors/{vendorId}/…`
 * として置く（vendorImageKeys / vendorFaviconKey）。両方とも vendorId だけから
 * 決定的に決まる（写真のような乱数の photoId を挟まない）ので、DB に持つ列は
 * 存在確認用の 1 本（vendors.representative_photo_key / favicon_key）で足りる。
 */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
export const MAX_PHOTOS_PER_UPLOAD = 20
export const MAX_EDGE_PX = 8000
/** URL から代表者の顔写真を取り込むときの上限（design 通り 5MB） */
export const MAX_IMPORTED_PHOTO_BYTES = 5 * 1024 * 1024

const UUIDISH = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const MANAGED_PHOTO = new RegExp(`^photos/${UUIDISH}/${UUIDISH}-(display|thumb)\\.jpg$`)
const MANAGED_VENDOR_REPRESENTATIVE = new RegExp(
  `^vendors/${UUIDISH}/representative-(display|thumb)\\.jpg$`,
)
// svg は含めない（src/lib/favicon.ts の FaviconExt/FaviconMimeType のコメント参照。
// SVG を画像として受け付けない設計のため favicon.svg キーは作られない）
const FAVICON_EXTS = ['png', 'ico', 'jpg', 'webp'] as const
const MANAGED_VENDOR_FAVICON = new RegExp(
  `^vendors/${UUIDISH}/favicon\\.(${FAVICON_EXTS.join('|')})$`,
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

/** 業者の代表者の顔写真。vendorId だけから決定的に決まる（display/thumb とも） */
export function vendorImageKeys(vendorId: string): { displayKey: string; thumbKey: string } {
  return {
    displayKey: `vendors/${vendorId}/representative-display.jpg`,
    thumbKey: `vendors/${vendorId}/representative-thumb.jpg`,
  }
}

/** 業者サイトのファビコン。拡張子はサイトごとに変わる（png/ico/jpg/webp。SVG を含めない
 * 理由は src/lib/favicon.ts の FaviconExt/FaviconMimeType のコメント参照） */
export function vendorFaviconKey(vendorId: string, ext: FaviconExt): string {
  return `vendors/${vendorId}/favicon.${ext}`
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
