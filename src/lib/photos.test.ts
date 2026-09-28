import { describe, expect, it } from 'vitest'

import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_UPLOAD,
  isManagedPhotoKey,
  photoKeys,
  photoUrl,
  representativeThumbKeyFromDisplayKey,
  sniffImageType,
  validatePhotoUpload,
  vendorFaviconKey,
  vendorImageKeys,
} from './photos'

const V = '11111111-1111-1111-1111-111111111111'
const P = '22222222-2222-2222-2222-222222222222'

describe('photoKeys / isManagedPhotoKey', () => {
  it('builds keys from the visit and photo ids and treats only those keys as managed', () => {
    const k = photoKeys(V, P)
    expect(k).toEqual({
      displayKey: `photos/${V}/${P}-display.jpg`,
      thumbKey: `photos/${V}/${P}-thumb.jpg`,
    })
    expect(isManagedPhotoKey(k.displayKey)).toBe(true)
    expect(isManagedPhotoKey(k.thumbKey)).toBe(true)
    expect(isManagedPhotoKey('backups/x.sql')).toBe(false)
    expect(isManagedPhotoKey(`photos/${V}/${P}-original.jpg`)).toBe(false)
    expect(isManagedPhotoKey(`photos/../${P}-display.jpg`)).toBe(false)
    expect(isManagedPhotoKey('')).toBe(false)
  })
})

describe('vendorImageKeys / vendorFaviconKey / isManagedPhotoKey (vendors/)', () => {
  it('builds the representative photo keys from vendorId and stamp and treats only those as managed', () => {
    const k = vendorImageKeys(V, '1abc2d')
    expect(k).toEqual({
      displayKey: `vendors/${V}/representative-1abc2d-display.jpg`,
      thumbKey: `vendors/${V}/representative-1abc2d-thumb.jpg`,
    })
    expect(isManagedPhotoKey(k.displayKey)).toBe(true)
    expect(isManagedPhotoKey(k.thumbKey)).toBe(true)
    // The same arguments give the same keys every time (idempotent)
    expect(vendorImageKeys(V, '1abc2d')).toEqual(k)
  })

  it('a different stamp gives a different key (the URL changes on every replacement)', () => {
    const first = vendorImageKeys(V, '1abc2d')
    const second = vendorImageKeys(V, '1abc2e')
    expect(first.displayKey).not.toBe(second.displayKey)
    expect(isManagedPhotoKey(first.displayKey)).toBe(true)
    expect(isManagedPhotoKey(second.displayKey)).toBe(true)
  })

  it('also treats old-format (no stamp) representative photo keys as managed (backward compatibility for existing rows)', () => {
    expect(isManagedPhotoKey(`vendors/${V}/representative-display.jpg`)).toBe(true)
    expect(isManagedPhotoKey(`vendors/${V}/representative-thumb.jpg`)).toBe(true)
  })

  it('representativeThumbKeyFromDisplayKey replaces the tail of the display key with thumb (in both the new and old format)', () => {
    expect(
      representativeThumbKeyFromDisplayKey(`vendors/${V}/representative-1abc2d-display.jpg`),
    ).toBe(`vendors/${V}/representative-1abc2d-thumb.jpg`)
    expect(representativeThumbKeyFromDisplayKey(`vendors/${V}/representative-display.jpg`)).toBe(
      `vendors/${V}/representative-thumb.jpg`,
    )
  })

  it('builds the favicon key from vendorId, extension and stamp, and treats only the declared extensions as managed', () => {
    for (const ext of ['png', 'ico', 'jpg', 'webp'] as const) {
      const key = vendorFaviconKey(V, ext, '1abc2d')
      expect(key).toBe(`vendors/${V}/favicon-1abc2d.${ext}`)
      expect(isManagedPhotoKey(key)).toBe(true)
    }
    expect(isManagedPhotoKey(`vendors/${V}/favicon-1abc2d.gif`)).toBe(false)
    expect(isManagedPhotoKey(`vendors/${V}/representative-1abc2d-original.jpg`)).toBe(false)
    expect(isManagedPhotoKey(`vendors/../${V}/favicon-1abc2d.png`)).toBe(false)
    // Rejected when there is only the stamp separator (hyphen) and the stamp itself is empty
    expect(isManagedPhotoKey(`vendors/${V}/favicon-.png`)).toBe(false)
    expect(isManagedPhotoKey(`vendors/${V}/representative--display.jpg`)).toBe(false)
  })

  it('also treats old-format (no stamp) favicon keys as managed (backward compatibility for existing rows)', () => {
    expect(isManagedPhotoKey(`vendors/${V}/favicon.png`)).toBe(true)
    expect(isManagedPhotoKey(`vendors/${V}/favicon.ico`)).toBe(true)
  })

  it('does not treat a key with a trailing newline as managed', () => {
    expect(isManagedPhotoKey(`vendors/${V}/favicon-1abc2d.png\n`)).toBe(false)
    expect(isManagedPhotoKey(`vendors/${V}/favicon-1abc2d.png\nDROP TABLE vendors;`)).toBe(false)
  })
})

describe('photoUrl', () => {
  it('strips photos/ and makes the URL of the serving route', () => {
    expect(photoUrl('photos/a/b-thumb.jpg')).toBe('/api/photos/a/b-thumb.jpg')
  })

  it('makes the URL of the serving route from a vendors/ key as is (nothing but photos/ is stripped)', () => {
    expect(photoUrl(`vendors/${V}/favicon.png`)).toBe(`/api/photos/vendors/${V}/favicon.png`)
  })
})

describe('sniffImageType', () => {
  it('detects JPEG/PNG/WebP by magic bytes and gives null for anything else', () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(
      'image/jpeg',
    )
    expect(
      sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])),
    ).toBe('image/png')
    const webp = new Uint8Array(12)
    webp.set([0x52, 0x49, 0x46, 0x46], 0)
    webp.set([0x57, 0x45, 0x42, 0x50], 8)
    expect(sniffImageType(webp)).toBe('image/webp')
    expect(
      sniffImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0, 0, 0, 0])),
    ).toBeNull()
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull()
  })
})

describe('validatePhotoUpload', () => {
  it('checks the size limit and dimensions. The return value is { status, message } or null', () => {
    expect(MAX_PHOTOS_PER_UPLOAD).toBe(20)
    expect(
      validatePhotoUpload({ displaySize: 1000, thumbSize: 100, width: 1600, height: 1200 }),
    ).toBeNull()
    expect(
      validatePhotoUpload({
        displaySize: MAX_PHOTO_BYTES + 1,
        thumbSize: 100,
        width: 1600,
        height: 1200,
      }),
    ).toEqual({ status: 413, message: expect.stringMatching(/大きすぎ/) })
    expect(
      validatePhotoUpload({
        displaySize: 1000,
        thumbSize: MAX_PHOTO_BYTES + 1,
        width: 1600,
        height: 1200,
      }),
    ).toEqual({ status: 413, message: expect.stringMatching(/大きすぎ/) })
    expect(
      validatePhotoUpload({ displaySize: 0, thumbSize: 100, width: 1600, height: 1200 }),
    ).toEqual({ status: 400, message: expect.stringMatching(/空/) })
    expect(
      validatePhotoUpload({ displaySize: 1000, thumbSize: 100, width: 0, height: 1200 }),
    ).toEqual({ status: 400, message: expect.stringMatching(/寸法/) })
    expect(
      validatePhotoUpload({ displaySize: 1000, thumbSize: 100, width: 1.5, height: 1200 }),
    ).toEqual({ status: 400, message: expect.stringMatching(/寸法/) })
    expect(
      validatePhotoUpload({ displaySize: 1000, thumbSize: 100, width: 9000, height: 1200 }),
    ).toEqual({ status: 400, message: expect.stringMatching(/寸法/) })
  })
})
