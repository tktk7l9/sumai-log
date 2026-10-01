import { describe, expect, it } from 'vitest'

import { parseArea, parseLabeledArea, parseNumber, sqmToTsubo } from './area'

describe('sqmToTsubo', () => {
  it('divides by 3.305785 and rounds to 2 decimals', () => {
    expect(sqmToTsubo(100)).toBe(30.25)
    expect(sqmToTsubo(120)).toBe(36.3)
  })
})

describe('parseNumber', () => {
  it('reads the first decimal number, full-width digits included', () => {
    expect(parseNumber('UA値 0.35')).toBe(0.35)
    expect(parseNumber('０．３１W(㎡・K)')).toBe(0.31)
    expect(parseNumber('C値0.6')).toBe(0.6)
  })

  it('returns null when there is no number', () => {
    expect(parseNumber('未計測')).toBeNull()
  })
})

describe('parseArea', () => {
  it('keeps tsubo as is and converts square metres', () => {
    expect(parseArea('50.50坪')).toBe(50.5)
    expect(parseArea('120㎡')).toBe(36.3)
    expect(parseArea('120 m2')).toBe(36.3)
    expect(parseArea('120m²')).toBe(36.3)
  })

  it('returns null without a unit or a number', () => {
    expect(parseArea('120')).toBeNull()
    expect(parseArea('坪')).toBeNull()
  })
})

describe('parseLabeledArea', () => {
  const text = '敷地面積 50.50坪 延床面積 30.20坪 総施工面積 33.15坪'

  it('reads the area that follows the label', () => {
    expect(parseLabeledArea(text, '敷地面積')).toBe(50.5)
    expect(parseLabeledArea(text, '延床面積')).toBe(30.2)
    expect(parseLabeledArea(text, '総施工面積')).toBe(33.15)
  })

  it('returns null when the label is missing', () => {
    expect(parseLabeledArea('延床面積 31.5坪', '敷地面積')).toBeNull()
  })
})
