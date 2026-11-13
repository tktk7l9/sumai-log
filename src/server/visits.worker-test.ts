import { describe, expect, it } from 'vitest'

import { reorderPhotosInput, VISIT_TEXT_MAX, visitInput } from './visits.schema'

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

describe('visitInput', () => {
  const base = {
    eventId: null,
    placeId: null,
    vendorId: null,
    propertyId: null,
    visitedOn: '2026-11-12',
    good: null,
    concerns: null,
    qa: null,
    nextActions: null,
  }
  const fields = ['good', 'concerns', 'qa', 'nextActions'] as const

  it('takes a long visit: 4,000 characters in each free-text field', () => {
    expect(VISIT_TEXT_MAX).toBe(4000)
    const long = 'あ'.repeat(VISIT_TEXT_MAX)
    const result = visitInput.safeParse({
      ...base,
      good: long,
      concerns: long,
      qa: long,
      nextActions: long,
    })
    expect(result.success).toBe(true)
  })

  it.each(fields)('names the field when %s is over the limit', (field) => {
    const result = visitInput.safeParse({ ...base, [field]: 'あ'.repeat(VISIT_TEXT_MAX + 1) })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((i) => [i.code, i.path])).toEqual([['too_big', [field]]])
    }
  })

  it('stores an empty or blank field as null', () => {
    const result = visitInput.safeParse({ ...base, good: '', qa: '  ' })
    expect(result.success && [result.data.good, result.data.qa]).toEqual([null, null])
  })
})
