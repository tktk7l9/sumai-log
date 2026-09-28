import { describe, expect, it } from 'vitest'

import { formatLatLng, parseCoordinate } from './coords'

describe('parseCoordinate', () => {
  it('converts degrees-minutes-seconds to decimal', () => {
    const parsed = parseCoordinate(`35°30'15.5"N 139°30'45.2"E`)
    expect(parsed).not.toBeNull()
    expect(parsed!.lat).toBeCloseTo(35 + 30 / 60 + 15.5 / 3600, 10)
    expect(parsed!.lng).toBeCloseTo(139 + 30 / 60 + 45.2 / 3600, 10)
  })

  it('also reads prime symbols, surrounding whitespace and lowercase directions', () => {
    expect(parseCoordinate(`  35°30′15.5″n, 139°30′45.2″e  `)).toEqual(
      parseCoordinate(`35°30'15.5"N 139°30'45.2"E`),
    )
  })

  it('makes south latitude and west longitude negative', () => {
    const parsed = parseCoordinate(`35°30'15.5"S 139°30'45.2"W`)
    expect(parsed!.lat).toBeLessThan(0)
    expect(parsed!.lng).toBeLessThan(0)
  })

  it('also reads decimal notation', () => {
    expect(parseCoordinate('35.5, 139.5')).toEqual({
      lat: 35.5,
      lng: 139.5,
    })
    expect(parseCoordinate('-35.5,-139.5')).toEqual({
      lat: -35.5,
      lng: -139.5,
    })
  })

  it('rejects minutes or seconds of 60 or more as a typo', () => {
    expect(parseCoordinate(`35°60'49.9"N 139°23'42.6"E`)).toBeNull()
    expect(parseCoordinate(`35°30'60.0"N 139°30'45.2"E`)).toBeNull()
    expect(parseCoordinate(`35°30'15.5"N 139°60'01.2"E`)).toBeNull()
    expect(parseCoordinate(`35°30'15.5"N 139°30'60.0"E`)).toBeNull()
  })

  it('rejects out-of-range values', () => {
    expect(parseCoordinate(`91°00'00.0"N 139°23'42.6"E`)).toBeNull()
    expect(parseCoordinate(`35°30'15.5"N 181°00'00.0"E`)).toBeNull()
    expect(parseCoordinate('91,139')).toBeNull()
    expect(parseCoordinate('35,-181')).toBeNull()
  })

  it('returns null for anything that cannot be read as coordinates', () => {
    expect(parseCoordinate('テスト市テスト町5丁目1')).toBeNull()
    expect(parseCoordinate('35.5')).toBeNull()
    expect(parseCoordinate('')).toBeNull()
    expect(parseCoordinate('   ')).toBeNull()
    expect(parseCoordinate(null)).toBeNull()
    expect(parseCoordinate(undefined)).toBeNull()
  })
})

describe('formatLatLng', () => {
  it('rounds the fraction produced by the DMS division to 6 digits', () => {
    expect(formatLatLng(parseCoordinate(`35°30'15.5"N 139°30'45.2"E`)!)).toBe(
      '35.504306,139.512556',
    )
  })

  it('adds no extra zeros', () => {
    expect(formatLatLng({ lat: 35.5, lng: -139 })).toBe('35.5,-139')
  })
})
