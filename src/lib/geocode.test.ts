import { describe, expect, it } from 'vitest'

import { buildGsiUrl, normalizeAddress, parseGsiResponse } from './geocode'

describe('normalizeAddress', () => {
  it('converts full-width alphanumerics to half-width, removes whitespace, and unifies chome / banchi notation variants', () => {
    expect(normalizeAddress(' 仮想県 テスト市 １－２－３ ')).toBe('仮想県テスト市1-2-3')
    expect(normalizeAddress('仮想県テスト市1丁目2番3号')).toBe('仮想県テスト市1-2-3')
    expect(normalizeAddress('仮想県テスト市1丁目')).toBe('仮想県テスト市1丁目')
  })
})

describe('buildGsiUrl', () => {
  it('builds the URL of the Geospatial Information Authority of Japan (GSI) address search API', () => {
    expect(buildGsiUrl('仮想県テスト市')).toBe(
      'https://msearch.gsi.go.jp/address-search/AddressSearch?q=%E4%BB%AE%E6%83%B3%E7%9C%8C%E3%83%86%E3%82%B9%E3%83%88%E5%B8%82',
    )
  })
})

describe('parseGsiResponse', () => {
  it('returns the coordinates ([lng, lat]) and title of the first Feature', () => {
    const json = [
      {
        geometry: { type: 'Point', coordinates: [139.5, 35.5] },
        properties: { title: '仮想県テスト市' },
      },
      { geometry: { type: 'Point', coordinates: [140, 36] }, properties: { title: '別の候補' } },
    ]
    expect(parseGsiResponse(json)).toEqual({ lat: 35.5, lng: 139.5, title: '仮想県テスト市' })
  })
  it('returns null for an empty array, a non-array, non-numeric coordinates and out of range', () => {
    expect(parseGsiResponse([])).toBeNull()
    expect(parseGsiResponse({})).toBeNull()
    expect(parseGsiResponse(null)).toBeNull()
    expect(parseGsiResponse([{ geometry: { coordinates: ['a', 'b'] } }])).toBeNull()
    expect(parseGsiResponse([{ geometry: { coordinates: [200, 35] } }])).toBeNull()
    expect(parseGsiResponse([{ geometry: { coordinates: [139.5] } }])).toBeNull()
    expect(parseGsiResponse([{ geometry: { coordinates: [139.5, 35.5] } }])).toEqual({
      lat: 35.5,
      lng: 139.5,
      title: null,
    })
  })
})
