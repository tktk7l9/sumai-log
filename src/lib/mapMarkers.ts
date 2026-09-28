import type { PlaceWithLinks } from '../server/repository'

/**
 * Minimal data for a pin on the map. Built from `PlaceWithLinks` by dropping places without
 * coordinates.
 */
export type MapMarker = {
  id: string
  name: string
  lat: number
  lng: number
  visited: boolean
  subtitle?: string
}

/** Turns only places with coordinates into markers. subtitle: vendor name, then property name */
export function toMarkers(places: readonly PlaceWithLinks[]): MapMarker[] {
  const out: MapMarker[] = []
  for (const p of places) {
    if (p.lat == null || p.lng == null) continue
    const subtitle = p.vendorName ?? p.propertyName ?? undefined
    out.push({
      id: p.id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      visited: p.visited,
      ...(subtitle ? { subtitle } : {}),
    })
  }
  return out
}

/** Rectangle containing all markers (south-west, north-east). 0 markers: null, 1 marker: a point */
export function boundsOf(
  markers: readonly MapMarker[],
): [[number, number], [number, number]] | null {
  if (markers.length === 0) return null
  let south = Infinity
  let west = Infinity
  let north = -Infinity
  let east = -Infinity
  for (const m of markers) {
    south = Math.min(south, m.lat)
    north = Math.max(north, m.lat)
    west = Math.min(west, m.lng)
    east = Math.max(east, m.lng)
  }
  return [
    [south, west],
    [north, east],
  ]
}
