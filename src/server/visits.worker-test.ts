import { describe, expect, it } from 'vitest'

import { reorderPhotosInput } from './visits.schema'

/**
 * saveVisit/reorderPhotos are wrapped in createServerFn, so calling them directly from a
 * plain vitest workers test fails (details are the same as events.worker-test.ts).
 * Checking the validator, reorderPhotosInput itself, is enough for real validation, so
 * here we check safeParse directly. Validating "does the photo really belong to that visit"
 * needs D1, so it is checked on the reorderPhotoRows side in
 * src/server/repository/photos.worker-test.ts.
 */
const visitId = '11111111-1111-4111-8111-111111111111'
const photoA = '22222222-2222-4222-8222-222222222222'
const photoB = '33333333-3333-4333-8333-333333333333'

describe('reorderPhotosInput', () => {
  it('accepts a visitId and photoIds without duplicates', () => {
    const result = reorderPhotosInput.safeParse({ visitId, photoIds: [photoB, photoA] })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.photoIds).toEqual([photoB, photoA])
    }
  })

  it('rejects empty photoIds ("写真が指定されていません" (No photos specified))', () => {
    const result = reorderPhotosInput.safeParse({ visitId, photoIds: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('写真が指定されていません')
    }
  })

  it('rejects photoIds with a duplicated id ("同じ写真が重複して指定されています" (The same photo is specified more than once))', () => {
    const result = reorderPhotosInput.safeParse({ visitId, photoIds: [photoA, photoA] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('同じ写真が重複して指定されています')
    }
  })

  it('rejects an id with an invalid shape', () => {
    const result = reorderPhotosInput.safeParse({ visitId, photoIds: ['not-a-uuid'] })
    expect(result.success).toBe(false)
  })

  it('rejects when visitId is missing', () => {
    const result = reorderPhotosInput.safeParse({ photoIds: [photoA] })
    expect(result.success).toBe(false)
  })
})
