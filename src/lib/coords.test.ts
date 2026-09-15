import { describe, expect, it } from 'vitest'

import { formatLatLng, parseCoordinate } from './coords'

describe('parseCoordinate', () => {
  it('度分秒を十進に直す', () => {
    const parsed = parseCoordinate(`35°30'15.5"N 139°30'45.2"E`)
    expect(parsed).not.toBeNull()
    expect(parsed!.lat).toBeCloseTo(35 + 30 / 60 + 15.5 / 3600, 10)
    expect(parsed!.lng).toBeCloseTo(139 + 30 / 60 + 45.2 / 3600, 10)
  })

  it('プライム記号・全体の空白・小文字の方位も読む', () => {
    expect(parseCoordinate(`  35°30′15.5″n, 139°30′45.2″e  `)).toEqual(
      parseCoordinate(`35°30'15.5"N 139°30'45.2"E`),
    )
  })

  it('南緯・西経は負の値にする', () => {
    const parsed = parseCoordinate(`35°30'15.5"S 139°30'45.2"W`)
    expect(parsed!.lat).toBeLessThan(0)
    expect(parsed!.lng).toBeLessThan(0)
  })

  it('十進の表記も読む', () => {
    expect(parseCoordinate('35.5, 139.5')).toEqual({
      lat: 35.5,
      lng: 139.5,
    })
    expect(parseCoordinate('-35.5,-139.5')).toEqual({
      lat: -35.5,
      lng: -139.5,
    })
  })

  it('分・秒が 60 以上の表記は書き間違いとして受けない', () => {
    expect(parseCoordinate(`35°60'49.9"N 139°23'42.6"E`)).toBeNull()
    expect(parseCoordinate(`35°30'60.0"N 139°30'45.2"E`)).toBeNull()
    expect(parseCoordinate(`35°30'15.5"N 139°60'01.2"E`)).toBeNull()
    expect(parseCoordinate(`35°30'15.5"N 139°30'60.0"E`)).toBeNull()
  })

  it('範囲外の値は受けない', () => {
    expect(parseCoordinate(`91°00'00.0"N 139°23'42.6"E`)).toBeNull()
    expect(parseCoordinate(`35°30'15.5"N 181°00'00.0"E`)).toBeNull()
    expect(parseCoordinate('91,139')).toBeNull()
    expect(parseCoordinate('35,-181')).toBeNull()
  })

  it('座標として読めないものは null', () => {
    expect(parseCoordinate('テスト市テスト町5丁目1')).toBeNull()
    expect(parseCoordinate('35.5')).toBeNull()
    expect(parseCoordinate('')).toBeNull()
    expect(parseCoordinate('   ')).toBeNull()
    expect(parseCoordinate(null)).toBeNull()
    expect(parseCoordinate(undefined)).toBeNull()
  })
})

describe('formatLatLng', () => {
  it('度分秒の割り算で出た端数を 6 桁に落とす', () => {
    expect(formatLatLng(parseCoordinate(`35°30'15.5"N 139°30'45.2"E`)!)).toBe(
      '35.504306,139.512556',
    )
  })

  it('余分な 0 は付けない', () => {
    expect(formatLatLng({ lat: 35.5, lng: -139 })).toBe('35.5,-139')
  })
})
