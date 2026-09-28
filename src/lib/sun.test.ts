import { describe, expect, it } from 'vitest'

import {
  SEASON_DECLINATION,
  SEASON_LABEL,
  convexHull,
  rayHitsBox,
  shadowPolygon,
  solarPosition,
  sunInLand,
} from './sun'

describe('solarPosition', () => {
  it('at culmination on the spring equinox has altitude 90 - latitude and azimuth 180°', () => {
    const p = solarPosition(35, 0, 12)
    expect(p.altitude).toBeCloseTo(55, 5)
    expect(p.azimuth).toBeCloseTo(180, 5)
  })

  it('at culmination on the winter solstice has altitude 90 - latitude - 23.44°', () => {
    expect(solarPosition(35.5, SEASON_DECLINATION.winter, 12).altitude).toBeCloseTo(31.06, 1)
    expect(SEASON_LABEL.winter).toBe('冬至')
  })

  it('is on the horizon due east at 6:00 on the spring equinox, and toward the west in the afternoon', () => {
    const morning = solarPosition(35, 0, 6)
    expect(morning.altitude).toBeCloseTo(0, 5)
    expect(morning.azimuth).toBeCloseTo(90, 5)
    expect(solarPosition(35, 0, 15).azimuth).toBeGreaterThan(180)
  })
})

describe('sunInLand', () => {
  it('on land with the road to the south (right = east, rear = north), the sun in the south shines from the front (-y)', () => {
    const v = sunInLand(0, 180, 90, 0)
    expect(v.x).toBeCloseTo(0, 10)
    expect(v.y).toBeCloseTo(-1, 10)
    expect(v.z).toBeCloseTo(0, 10)
  })

  it('puts the sun in the east on the right (+x)', () => {
    const v = sunInLand(30, 90, 90, 0)
    expect(v.x).toBeCloseTo(Math.cos(Math.PI / 6), 10)
    expect(v.z).toBeCloseTo(0.5, 10)
  })
})

describe('convexHull', () => {
  it('drops interior points', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ])
    expect(hull).toHaveLength(4)
    expect(hull).not.toContainEqual({ x: 1, y: 1 })
  })
})

const box = { x: 0, y: 10, width: 4, depth: 4, height: 10 }

describe('shadowPolygon', () => {
  it('stretches the shadow toward the rear by the height for a sun at 45° from the south', () => {
    const sun = sunInLand(45, 180, 90, 0)
    const poly = shadowPolygon(box, sun)!
    const maxY = Math.max(...poly.map((p) => p.y))
    expect(maxY).toBeCloseTo(24, 5)
  })

  it('returns null when the sun is not up or there is no height', () => {
    expect(shadowPolygon(box, { x: 0, y: -1, z: 0 })).toBeNull()
    expect(shadowPolygon({ ...box, height: 0 }, sunInLand(45, 180, 90, 0))).toBeNull()
  })
})

describe('rayHitsBox', () => {
  const south45 = sunInLand(45, 180, 90, 0)

  it('blocks a point inside the shadow of a building to the south', () => {
    // 3m north of the building, window height 1m. At 45° the ray enters the building before it
    // reaches the height of 10m, 9m ahead
    expect(rayHitsBox({ x: 2, y: 17, z: 1 }, south45, box)).toBe(true)
  })

  it('does not block points outside the shadow (far away, off to the side, or higher than the building)', () => {
    expect(rayHitsBox({ x: 2, y: 30, z: 1 }, south45, box)).toBe(false)
    expect(rayHitsBox({ x: 10, y: 17, z: 1 }, south45, box)).toBe(false)
    expect(rayHitsBox({ x: 2, y: 17, z: 11 }, south45, box)).toBe(false)
    expect(rayHitsBox({ x: 2, y: 17, z: 1 }, { x: 0, y: -1, z: 0 }, box)).toBe(false)
  })

  it('decides by inside or outside the range on an axis when the ray is parallel to that axis', () => {
    const fromWest = { x: -Math.SQRT1_2, y: 0, z: Math.SQRT1_2 }
    expect(rayHitsBox({ x: 6, y: 12, z: 1 }, fromWest, box)).toBe(true)
    expect(rayHitsBox({ x: 6, y: 20, z: 1 }, fromWest, box)).toBe(false)
  })
})
