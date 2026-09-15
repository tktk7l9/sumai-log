import { describe, expect, it } from 'vitest'

import { emptyToNull } from './emptyToNull'

describe('emptyToNull', () => {
  it('空文字は null にする（Mantine NumberInput の空欄値）', () => {
    expect(emptyToNull('')).toBeNull()
  })
  it('0 や負の数はそのまま通す（空文字と混同しない）', () => {
    expect(emptyToNull(0)).toBe(0)
    expect(emptyToNull(-5)).toBe(-5)
  })
  it('値のある数値・文字列はそのまま通す', () => {
    expect(emptyToNull(80)).toBe(80)
    expect(emptyToNull('80')).toBe('80')
  })
})
