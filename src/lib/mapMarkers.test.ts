import { describe, expect, it } from 'vitest'

import { boundsOf, toMarkers } from './mapMarkers'

const base = {
  kind: 'showroom',
  address: null,
  coordsText: null,
  geocodeSource: null,
  vendorId: null,
  propertyId: null,
  note: null,
  createdBy: 'owner@example.com',
  createdAt: '',
  updatedAt: '',
  propertyName: null,
} as const

describe('toMarkers', () => {
  it('座標のある場所だけをマーカーにし、業者名を subtitle にする', () => {
    const rows = [
      { ...base, id: 'a', name: 'A', lat: 35, lng: 139, vendorName: '甲工務店', visited: true },
      { ...base, id: 'b', name: 'B', lat: null, lng: null, vendorName: null, visited: false },
    ]
    expect(toMarkers(rows)).toEqual([
      { id: 'a', name: 'A', lat: 35, lng: 139, visited: true, subtitle: '甲工務店' },
    ])
  })

  it('業者名が無ければ物件名を subtitle にする', () => {
    const rows = [
      {
        ...base,
        id: 'c',
        name: 'C',
        lat: 35,
        lng: 139,
        vendorName: null,
        propertyName: 'あさひマンション',
        visited: false,
      },
    ]
    expect(toMarkers(rows)).toEqual([
      { id: 'c', name: 'C', lat: 35, lng: 139, visited: false, subtitle: 'あさひマンション' },
    ])
  })

  it('業者名も物件名も無ければ subtitle を付けない', () => {
    const rows = [
      { ...base, id: 'd', name: 'D', lat: 35, lng: 139, vendorName: null, visited: false },
    ]
    expect(toMarkers(rows)).toEqual([{ id: 'd', name: 'D', lat: 35, lng: 139, visited: false }])
  })
})
describe('boundsOf', () => {
  it('全マーカーを含む矩形。0 件は null、1 件は点', () => {
    expect(boundsOf([])).toBeNull()
    expect(boundsOf([{ id: 'a', name: 'A', lat: 35, lng: 139, visited: false }])).toEqual([
      [35, 139],
      [35, 139],
    ])
    expect(
      boundsOf([
        { id: 'a', name: 'A', lat: 35, lng: 139, visited: false },
        { id: 'b', name: 'B', lat: 36, lng: 138, visited: false },
      ]),
    ).toEqual([
      [35, 138],
      [36, 139],
    ])
  })
})
