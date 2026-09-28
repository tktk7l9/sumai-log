import { describe, expect, it } from 'vitest'

import { isIdLike } from './ids'

describe('isIdLike', () => {
  it('accepts the output of crypto.randomUUID() (v4)', () => {
    expect(isIdLike(crypto.randomUUID())).toBe(true)
  })

  it('also accepts a lowercase UUID shape that is not v4 (does not satisfy the version/variant nibbles)', () => {
    expect(isIdLike('00000000-0000-0000-0000-000000000000')).toBe(true)
  })

  it('rejects uppercase', () => {
    expect(isIdLike('7D885050-CC49-E8BA-A2A6-79C4F1CC4C92')).toBe(false)
  })

  it('rejects a wrong length or missing hyphens', () => {
    expect(isIdLike('7d885050-cc49-e8ba-a2a6-79c4f1cc4c9')).toBe(false)
    expect(isIdLike('7d885050cc49e8baa2a679c4f1cc4c92')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isIdLike('')).toBe(false)
  })
})
