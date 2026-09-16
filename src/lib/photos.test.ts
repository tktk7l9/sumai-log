import { describe, expect, it } from 'vitest'

import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_UPLOAD,
  isManagedPhotoKey,
  photoKeys,
  photoUrl,
  sniffImageType,
  validatePhotoUpload,
  vendorFaviconKey,
  vendorImageKeys,
} from './photos'

const V = '11111111-1111-1111-1111-111111111111'
const P = '22222222-2222-2222-2222-222222222222'

describe('photoKeys / isManagedPhotoKey', () => {
  it('visit と photo の id からキーを作り、そのキーだけを管理対象とみなす', () => {
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

describe('vendorImageKeys / vendorFaviconKey / isManagedPhotoKey（vendors/）', () => {
  it('vendorId だけから代表者写真のキーを決定的に作り、それだけを管理対象とみなす', () => {
    const k = vendorImageKeys(V)
    expect(k).toEqual({
      displayKey: `vendors/${V}/representative-display.jpg`,
      thumbKey: `vendors/${V}/representative-thumb.jpg`,
    })
    expect(isManagedPhotoKey(k.displayKey)).toBe(true)
    expect(isManagedPhotoKey(k.thumbKey)).toBe(true)
    // 同じ vendorId を渡せば毎回同じキーになる（冪等）
    expect(vendorImageKeys(V)).toEqual(k)
  })

  it('ファビコンのキーは拡張子込みで、宣言した拡張子だけ管理対象とみなす', () => {
    for (const ext of ['png', 'ico', 'jpg', 'webp'] as const) {
      const key = vendorFaviconKey(V, ext)
      expect(key).toBe(`vendors/${V}/favicon.${ext}`)
      expect(isManagedPhotoKey(key)).toBe(true)
    }
    expect(isManagedPhotoKey(`vendors/${V}/favicon.gif`)).toBe(false)
    expect(isManagedPhotoKey(`vendors/${V}/representative-original.jpg`)).toBe(false)
    expect(isManagedPhotoKey(`vendors/../${V}/favicon.png`)).toBe(false)
  })
})

describe('photoUrl', () => {
  it('photos/ を剥がして配信ルートの URL にする', () => {
    expect(photoUrl('photos/a/b-thumb.jpg')).toBe('/api/photos/a/b-thumb.jpg')
  })

  it('vendors/ キーはそのまま配信ルートの URL にする（photos/ 以外は剥がさない）', () => {
    expect(photoUrl(`vendors/${V}/favicon.png`)).toBe(`/api/photos/vendors/${V}/favicon.png`)
  })
})

describe('sniffImageType', () => {
  it('マジックバイトで JPEG/PNG/WebP を判定し、それ以外は null', () => {
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
  it('上限と寸法を見る。返り値は { status, message } か null', () => {
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
