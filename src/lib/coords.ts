/**
 * Reading coordinates and formatting them for display.
 *
 * Ported from kousan-admin `src/lib/maps.ts`: only `LatLng` `parseCoordinate` `formatLatLng`
 * (the Google Maps URL building is not brought over).
 */

export type LatLng = { lat: number; lng: number }

// 12°34'56.7"N 123°45'01.2"E (notation with prime symbols is accepted too)
const DMS =
  /^(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*["″]\s*([NS])[\s,]+(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*["″]\s*([EW])$/i

// 35.681236, 139.767125
const DECIMAL = /^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/

function inRange({ lat, lng }: LatLng): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

/**
 * Reads a coordinate string. Accepts both degrees-minutes-seconds and decimal.
 *
 * The ledger keeps the notation exactly as the person who looked it up wrote it; conversion
 * happens here. Storing only the decimal value would make it impossible to check against the
 * original record.
 * Unreadable or out-of-range values return null, and the screen says the map cannot be shown.
 */
export function parseCoordinate(value: string | null | undefined): LatLng | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const dms = DMS.exec(trimmed)
  if (dms) {
    const [, latDeg, latMin, latSec, ns, lngDeg, lngMin, lngSec, ew] = dms
    // Minutes or seconds of 60 or more are a typo, so reject them
    if (Number(latMin) >= 60 || Number(latSec) >= 60) return null
    if (Number(lngMin) >= 60 || Number(lngSec) >= 60) return null

    const lat =
      (Number(latDeg) + Number(latMin) / 60 + Number(latSec) / 3600) *
      (ns.toUpperCase() === 'S' ? -1 : 1)
    const lng =
      (Number(lngDeg) + Number(lngMin) / 60 + Number(lngSec) / 3600) *
      (ew.toUpperCase() === 'W' ? -1 : 1)
    const parsed = { lat, lng }
    return inRange(parsed) ? parsed : null
  }

  const decimal = DECIMAL.exec(trimmed)
  if (decimal) {
    const parsed = { lat: Number(decimal[1]), lng: Number(decimal[2]) }
    return inRange(parsed) ? parsed : null
  }

  return null
}

/**
 * Formats coordinates for the map. The fraction from the DMS division is rounded to 6 digits
 * (about 0.1m)
 */
export function formatLatLng({ lat, lng }: LatLng): string {
  const round = (value: number) => Number(value.toFixed(6)).toString()
  return `${round(lat)},${round(lng)}`
}
