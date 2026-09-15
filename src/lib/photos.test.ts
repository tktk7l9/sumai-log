import { describe, expect, it } from 'vitest'

import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_UPLOAD,
  isManagedPhotoKey,
  photoKeys,
  sniffImageType,
  validatePhotoUpload,
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
  it('上限と寸法を見る', () => {
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
    ).toMatch(/大きすぎ/)
    expect(
      validatePhotoUpload({
        displaySize: 1000,
        thumbSize: MAX_PHOTO_BYTES + 1,
        width: 1600,
        height: 1200,
      }),
    ).toMatch(/大きすぎ/)
    expect(
      validatePhotoUpload({ displaySize: 0, thumbSize: 100, width: 1600, height: 1200 }),
    ).toMatch(/空/)
    expect(
      validatePhotoUpload({ displaySize: 1000, thumbSize: 100, width: 0, height: 1200 }),
    ).toMatch(/寸法/)
    expect(
      validatePhotoUpload({ displaySize: 1000, thumbSize: 100, width: 1.5, height: 1200 }),
    ).toMatch(/寸法/)
    expect(
      validatePhotoUpload({ displaySize: 1000, thumbSize: 100, width: 9000, height: 1200 }),
    ).toMatch(/寸法/)
  })
})
