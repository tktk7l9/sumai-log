import type { FaviconExt } from './favicon'

/**
 * R2 keys for photos and validation of incoming uploads. R2 is private, and the Worker
 * streams photos after authentication. Keys are `photos/{visitId}/{photoId}-display.jpg`
 * and `-thumb.jpg`. The seed import (scripts/lib/seed.mjs) stores objects in the same shape,
 * so when you change this, change that too.
 *
 * The vendor representative's portrait and the site favicon also go into the same R2 bucket
 * as `vendors/{vendorId}/…` (vendorImageKeys / vendorFaviconKey). Delivery
 * (api.photos.$.tsx) caches every key for 1 year with `immutable`, so to keep an old image
 * from being served after a replacement, the key carries a `stamp` (the base36 `Date.now()`
 * passed by the caller) and becomes a different URL every time
 * (addresses final review Must #1). The DB (vendors.representative_photo_key / favicon_key)
 * stores the key that was actually written as is, and the next key to use is always read
 * from there (the current stamp cannot be known from vendorId alone). The thumbnail
 * (-thumb.jpg) is derived just by replacing the tail of the stored display key, so it has
 * no column of its own (representativeThumbKeyFromDisplayKey).
 *
 * Backward compatibility: `isManagedPhotoKey` keeps allowing keys stored before this scheme
 * was introduced (`representative-display.jpg` / `favicon.<ext>` without a stamp), so that
 * existing rows can still be served as they are.
 */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
export const MAX_PHOTOS_PER_UPLOAD = 20
export const MAX_EDGE_PX = 8000
/** Size limit when importing the representative's portrait from a URL (5MB, as in the design) */
export const MAX_IMPORTED_PHOTO_BYTES = 5 * 1024 * 1024

const UUIDISH = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
/** The base36 stamp (Date.now().toString(36)). The only difference from the old format is
 * whether this part is present */
const STAMP = '[0-9a-z]+'
const MANAGED_PHOTO = new RegExp(`^photos/${UUIDISH}/${UUIDISH}-(display|thumb)\\.jpg$`)
// Allow both the new format with a trailing `-{stamp}` and the old format without it
const MANAGED_VENDOR_REPRESENTATIVE = new RegExp(
  `^vendors/${UUIDISH}/representative-(${STAMP}-)?(display|thumb)\\.jpg$`,
)
// svg is not included (see the comment on FaviconExt/FaviconMimeType in src/lib/favicon.ts.
// The design does not accept SVG as an image, so a favicon.svg key is never created)
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
 * The vendor representative's portrait. Inserting a `stamp` (the base36 `Date.now()` passed
 * by the caller) gives a different URL on every replacement even for the same vendorId
 * (a countermeasure for the immutable cache).
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
 * Derives the matching thumb key from a stored display key (representative_photo_key in the
 * DB). display/thumb are created with the same stamp, so replacing the trailing
 * `-display.jpg` with `-thumb.jpg` is enough (the same rule works for keys in both the new
 * and the old format). The current stamp cannot be known from vendorId alone, so the caller
 * must always pass the actual key stored in the DB.
 */
export function representativeThumbKeyFromDisplayKey(displayKey: string): string {
  return displayKey.replace(/-display\.jpg$/, '-thumb.jpg')
}

/** The favicon of the vendor's site. The extension differs per site (png/ico/jpg/webp. For
 * why SVG is not included, see the comment on FaviconExt/FaviconMimeType in
 * src/lib/favicon.ts). The reason for `stamp` is the same as in vendorImageKeys
 * (a countermeasure for the immutable cache). */
export function vendorFaviconKey(vendorId: string, ext: FaviconExt, stamp: string): string {
  return `vendors/${vendorId}/favicon-${stamp}.${ext}`
}

export function isManagedPhotoKey(key: string): boolean {
  // The regexes below have no multiline flag, so $ matches only at "the end of the input",
  // and any string with a trailing newline should already come out false. But because this
  // decides which keys are allowed, and to avoid confusion with other regex implementations
  // where "$ can also match just before a newline", reject explicitly as soon as the key
  // contains a newline (a defence that self-documents the intent).
  if (key.includes('\n')) return false
  return (
    MANAGED_PHOTO.test(key) ||
    MANAGED_VENDOR_REPRESENTATIVE.test(key) ||
    MANAGED_VENDOR_FAVICON.test(key)
  )
}

/** URL of the delivery route (GET /api/photos/<key>). The route puts photos/ back on */
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

/** Raster types the app ever stores (photos, vendor portraits and favicons). Never SVG or HTML */
const SERVABLE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
])

/**
 * The content-type used when streaming an R2 object back to the browser.
 *
 * Every write path sniffs the bytes first, so the stored type should always be a raster
 * image. This is defence in depth: if an object ever carries another type (SVG, HTML, a
 * hand-run `wrangler r2 object put`), it is served as an opaque download type instead of
 * something the browser would render as a document on this origin.
 */
export function servableImageType(stored: string | null | undefined): string {
  const type = (stored ?? '').split(';')[0].trim().toLowerCase()
  if (type === '') return 'image/jpeg'
  return SERVABLE_IMAGE_TYPES.has(type) ? type : 'application/octet-stream'
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
