import { describe, expect, it } from 'vitest'

import { buildGsiUrl, normalizeAddress, parseGsiResponse } from './geocode'

describe('normalizeAddress', () => {
  it('全角英数を半角に、空白を除き、丁目・番地の表記ゆれを揃える', () => {
    expect(normalizeAddress(' 仮想県 テスト市 １－２－３ ')).toBe('仮想県テスト市1-2-3')
    expect(normalizeAddress('仮想県テスト市1丁目2番3号')).toBe('仮想県テスト市1-2-3')
    expect(normalizeAddress('仮想県テスト市1丁目')).toBe('仮想県テスト市1丁目')
  })
})

describe('buildGsiUrl', () => {
  it('国土地理院の住所検索 API の URL を組み立てる', () => {
    expect(buildGsiUrl('仮想県テスト市')).toBe(
      'https://msearch.gsi.go.jp/address-search/AddressSearch?q=%E4%BB%AE%E6%83%B3%E7%9C%8C%E3%83%86%E3%82%B9%E3%83%88%E5%B8%82',
    )
  })
})

describe('parseGsiResponse', () => {
  it('先頭の Feature の座標（[lng, lat]）と title を返す', () => {
    const json = [
      {
        geometry: { type: 'Point', coordinates: [139.5, 35.5] },
        properties: { title: '仮想県テスト市' },
      },
      { geometry: { type: 'Point', coordinates: [140, 36] }, properties: { title: '別の候補' } },
    ]
    expect(parseGsiResponse(json)).toEqual({ lat: 35.5, lng: 139.5, title: '仮想県テスト市' })
  })
  it('空配列・配列でない・座標が数値でない・範囲外は null', () => {
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
