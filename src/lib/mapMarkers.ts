import type { PlaceWithLinks } from '../server/repository'

/**
 * 地図に置くピンの最小情報。`PlaceWithLinks` から座標が無い場所を落として作る。
 */
export type MapMarker = {
  id: string
  name: string
  lat: number
  lng: number
  visited: boolean
  subtitle?: string
}

/** 座標のある場所だけをマーカーにする。subtitle は業者名→物件名の順で拾う */
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

/** 全マーカーを含む矩形（南西・北東）。0 件は null、1 件は点になる */
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
