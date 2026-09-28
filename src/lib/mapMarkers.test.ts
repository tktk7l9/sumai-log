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
  it('turns only places with coordinates into markers and uses the vendor name as subtitle', () => {
    const rows = [
      { ...base, id: 'a', name: 'A', lat: 35, lng: 139, vendorName: '甲工務店', visited: true },
      { ...base, id: 'b', name: 'B', lat: null, lng: null, vendorName: null, visited: false },
    ]
    expect(toMarkers(rows)).toEqual([
      { id: 'a', name: 'A', lat: 35, lng: 139, visited: true, subtitle: '甲工務店' },
    ])
  })

  it('uses the property name as subtitle when there is no vendor name', () => {
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

  it('adds no subtitle when there is neither a vendor name nor a property name', () => {
    const rows = [
      { ...base, id: 'd', name: 'D', lat: 35, lng: 139, vendorName: null, visited: false },
    ]
    expect(toMarkers(rows)).toEqual([{ id: 'd', name: 'D', lat: 35, lng: 139, visited: false }])
  })
})
describe('boundsOf', () => {
  it('rectangle containing all markers. 0 markers give null, 1 marker gives a point', () => {
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
