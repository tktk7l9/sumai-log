/**
 * Pure functions for sunlight (for the site plan simulator). Computes the position of the
 * sun, the shadow of a building, and whether the sun hits a given point.
 *
 * Time is true solar time (the time when the sun is due south is 12 o'clock). The equation
 * of time and the longitude correction are not applied (the deviation is a few minutes to
 * somewhat over ten minutes, which does not affect a rough guide of sunlight hours).
 * Atmospheric refraction is not applied either.
 *
 * Azimuth is 0° at north, clockwise (east 90°, south 180°). It is mapped to land
 * coordinates (x: along the frontage, y: road -> rear, z: height) by "the azimuth of right
 * (+x)" and "the azimuth of rear (+y)".
 */

export const SEASONS = ['winter', 'equinox', 'summer'] as const
export type Season = (typeof SEASONS)[number]
export const SEASON_LABEL: Record<Season, string> = {
  winter: '冬至',
  equinox: '春分・秋分',
  summer: '夏至',
}
/** Declination of the sun (degrees) */
export const SEASON_DECLINATION: Record<Season, number> = {
  winter: -23.44,
  equinox: 0,
  summer: 23.44,
}

const RAD = Math.PI / 180

export type Vec3 = { x: number; y: number; z: number }
export type Point = { x: number; y: number }
export type Box = { x: number; y: number; width: number; depth: number; height: number }

/** Altitude and azimuth of the sun (degrees). hour is true solar time (12 = culmination) */
export function solarPosition(
  latitude: number,
  declination: number,
  hour: number,
): { altitude: number; azimuth: number } {
  const phi = latitude * RAD
  const delta = declination * RAD
  const h = (hour - 12) * 15 * RAD
  const east = -Math.cos(delta) * Math.sin(h)
  const north = Math.sin(delta) * Math.cos(phi) - Math.cos(delta) * Math.sin(phi) * Math.cos(h)
  const up = Math.sin(delta) * Math.sin(phi) + Math.cos(delta) * Math.cos(phi) * Math.cos(h)
  const azimuth = (Math.atan2(east, north) / RAD + 360) % 360
  return { altitude: Math.asin(up) / RAD, azimuth }
}

/** The direction of the sun (a unit vector) in land coordinates. rightAz / backAz are the
 * azimuths of +x / +y of the land (degrees) */
export function sunInLand(
  altitude: number,
  azimuth: number,
  rightAz: number,
  backAz: number,
): Vec3 {
  const horizontal = Math.cos(altitude * RAD)
  const e = horizontal * Math.sin(azimuth * RAD)
  const n = horizontal * Math.cos(azimuth * RAD)
  return {
    x: e * Math.sin(rightAz * RAD) + n * Math.cos(rightAz * RAD),
    y: e * Math.sin(backAz * RAD) + n * Math.cos(backAz * RAD),
    z: Math.sin(altitude * RAD),
  }
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/** Convex hull (Andrew's monotone chain). Counterclockwise */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const lower: Point[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** The polygon of the shadow that a box (a building) casts on the ground. null when the sun
 * is not up or there is no height */
export function shadowPolygon(box: Box, sun: Vec3): Point[] | null {
  if (sun.z <= 0 || box.height <= 0) return null
  const k = box.height / sun.z
  const dx = -sun.x * k
  const dy = -sun.y * k
  const corners: Point[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.depth },
    { x: box.x, y: box.y + box.depth },
  ]
  return convexHull([...corners, ...corners.map((c) => ({ x: c.x + dx, y: c.y + dy }))])
}

/** Whether the ray from point p toward the sun hits the box (= whether p is in the shadow of
 * that box) */
export function rayHitsBox(p: Vec3, sun: Vec3, box: Box): boolean {
  if (sun.z <= 0 || box.height <= p.z) return false
  // The distance until the ray reaches the height of the box. If it enters the plan outline
  // of the box before that, it is blocked
  const tMax = (box.height - p.z) / sun.z
  let t0 = 0
  let t1 = tMax
  for (const [origin, dir, min, max] of [
    [p.x, sun.x, box.x, box.x + box.width],
    [p.y, sun.y, box.y, box.y + box.depth],
  ] as const) {
    if (Math.abs(dir) < 1e-12) {
      if (origin < min || origin > max) return false
      continue
    }
    let a = (min - origin) / dir
    let b = (max - origin) / dir
    if (a > b) [a, b] = [b, a]
    t0 = Math.max(t0, a)
    t1 = Math.min(t1, b)
    if (t0 > t1) return false
  }
  return true
}
