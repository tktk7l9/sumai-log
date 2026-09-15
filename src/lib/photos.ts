/**
 * 写真の R2 キーと受け取り検査。R2 は非公開で、配信は認証後に Worker が
 * ストリームする。キーは `photos/{visitId}/{photoId}-display.jpg` と `-thumb.jpg`。
 * seed 取込（scripts/lib/seed.mjs）も同じ形で置くので、ここを変えたらそちらも変える。
 */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
export const MAX_PHOTOS_PER_UPLOAD = 20
export const MAX_EDGE_PX = 8000

const UUIDISH = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const MANAGED = new RegExp(`^photos/${UUIDISH}/${UUIDISH}-(display|thumb)\\.jpg$`)

export function photoKeys(
  visitId: string,
  photoId: string,
): { displayKey: string; thumbKey: string } {
  return {
    displayKey: `photos/${visitId}/${photoId}-display.jpg`,
    thumbKey: `photos/${visitId}/${photoId}-thumb.jpg`,
  }
}

export function isManagedPhotoKey(key: string): boolean {
  return MANAGED.test(key)
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
}): string | null {
  if (input.displaySize <= 0 || input.thumbSize <= 0) return '画像が空です'
  if (input.displaySize > MAX_PHOTO_BYTES || input.thumbSize > MAX_PHOTO_BYTES) {
    return `画像が大きすぎます（上限 ${MAX_PHOTO_BYTES / 1024 / 1024}MB）`
  }
  for (const n of [input.width, input.height]) {
    if (!Number.isInteger(n) || n < 1 || n > MAX_EDGE_PX) return '画像の寸法が不正です'
  }
  return null
}
