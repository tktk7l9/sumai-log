import { describe, expect, it } from 'vitest'

import { listVendorNewsInput, newsEventsBetweenInput, planVisitInput } from './news.schema'

/**
 * fetchNewsNow / planVisitFromNews are wrapped in createServerFn, so calling them
 * directly from a plain vitest workers test without the TanStack Start server runtime
 * (the Start context of AsyncLocalStorage) fails with "No Start context found"
 * (before it even reaches the validator). Looking at the schemas in news.schema.ts, which
 * are the validators, is enough for the actual validation, so this file checks safeParse
 * directly (the same pattern as src/server/events.worker-test.ts).
 */
describe('listVendorNewsInput', () => {
  it('falls back to the defaults with no vendorId and limit/offset omitted', () => {
    const result = listVendorNewsInput.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ limit: 50, offset: 0 })
    }
  })

  it('allows limit up to 200 (the safety cap for 1 month)', () => {
    expect(listVendorNewsInput.safeParse({ limit: 200 }).success).toBe(true)
  })

  it('rejects limit above 200', () => {
    expect(listVendorNewsInput.safeParse({ limit: 201 }).success).toBe(false)
  })

  it('rejects a negative offset', () => {
    expect(listVendorNewsInput.safeParse({ offset: -1 }).success).toBe(false)
  })

  it('accepts from/to (the period of the publication date), in YYYY-MM-DD form', () => {
    const result = listVendorNewsInput.safeParse({ from: '2026-09-01', to: '2026-09-30' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({ from: '2026-09-01', to: '2026-09-30' })
    }
  })

  it('allows omitting from/to (no period filter)', () => {
    const result = listVendorNewsInput.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.from).toBeUndefined()
      expect(result.data.to).toBeUndefined()
    }
  })

  it('rejects from/to in a wrong format', () => {
    expect(listVendorNewsInput.safeParse({ from: '2026/09/01' }).success).toBe(false)
    expect(listVendorNewsInput.safeParse({ to: '9-2026-01' }).success).toBe(false)
  })
})

describe('newsEventsBetweenInput', () => {
  it('passes YYYY-MM-DD from/to through as is (spanning months is fine)', () => {
    const result = newsEventsBetweenInput.safeParse({ from: '2026-08-25', to: '2026-10-07' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ from: '2026-08-25', to: '2026-10-07' })
    }
  })

  it('rejects a wrong format', () => {
    expect(newsEventsBetweenInput.safeParse({ from: '2026/09/01', to: '2026-09-30' }).success).toBe(
      false,
    )
  })
})

describe('planVisitInput', () => {
  it('rejects an id that is not in UUID form', () => {
    expect(planVisitInput.safeParse({ newsId: 'not-a-uuid' }).success).toBe(false)
  })

  it('passes for a UUID', () => {
    const result = planVisitInput.safeParse({ newsId: '11111111-1111-1111-1111-111111111111' })
    expect(result.success).toBe(true)
  })
})
