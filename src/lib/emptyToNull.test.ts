import { describe, expect, it } from 'vitest'

import { emptyToNull } from './emptyToNull'

describe('emptyToNull', () => {
  it('turns an empty string into null (the blank value of Mantine NumberInput)', () => {
    expect(emptyToNull('')).toBeNull()
  })
  it('passes 0 and negative numbers through (not confused with an empty string)', () => {
    expect(emptyToNull(0)).toBe(0)
    expect(emptyToNull(-5)).toBe(-5)
  })
  it('passes numbers and strings that have a value through', () => {
    expect(emptyToNull(80)).toBe(80)
    expect(emptyToNull('80')).toBe('80')
  })
})
