/**
 * Pure part of scripts/backup.mjs: which R2 objects the database points at.
 *
 * The thumbnail of a representative's portrait has no column; it is the display key with
 * `-display.jpg` replaced by `-thumb.jpg` (representativeThumbKeyFromDisplayKey in
 * src/lib/photos.ts; kept in step by hand, the script side is plain .mjs).
 */

/** The keys to fetch, in a stable order and without repeats */
export function r2KeysOf({ photos = [], vendors = [] }) {
  const keys = new Set()
  for (const p of photos) {
    if (p.display_key) keys.add(p.display_key)
    if (p.thumb_key) keys.add(p.thumb_key)
  }
  for (const v of vendors) {
    if (v.representative_photo_key) {
      keys.add(v.representative_photo_key)
      keys.add(v.representative_photo_key.replace(/-display\.jpg$/, '-thumb.jpg'))
    }
    if (v.favicon_key) keys.add(v.favicon_key)
  }
  return [...keys]
}
