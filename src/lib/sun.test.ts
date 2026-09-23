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
  it('春分の南中は 高度 90−緯度・方位 180°', () => {
    const p = solarPosition(35, 0, 12)
    expect(p.altitude).toBeCloseTo(55, 5)
    expect(p.azimuth).toBeCloseTo(180, 5)
  })

  it('冬至の南中は 90−緯度−23.44°', () => {
    expect(solarPosition(35.5, SEASON_DECLINATION.winter, 12).altitude).toBeCloseTo(31.06, 1)
    expect(SEASON_LABEL.winter).toBe('冬至')
  })

  it('春分の 6 時は真東の地平線、午後は西寄り', () => {
    const morning = solarPosition(35, 0, 6)
    expect(morning.altitude).toBeCloseTo(0, 5)
    expect(morning.azimuth).toBeCloseTo(90, 5)
    expect(solarPosition(35, 0, 15).azimuth).toBeGreaterThan(180)
  })
})

describe('sunInLand', () => {
  it('道路が南の土地（右＝東・奥＝北）で、南の太陽は手前（−y）から照らす', () => {
    const v = sunInLand(0, 180, 90, 0)
    expect(v.x).toBeCloseTo(0, 10)
    expect(v.y).toBeCloseTo(-1, 10)
    expect(v.z).toBeCloseTo(0, 10)
  })

  it('東の太陽は右（+x）', () => {
    const v = sunInLand(30, 90, 90, 0)
    expect(v.x).toBeCloseTo(Math.cos(Math.PI / 6), 10)
    expect(v.z).toBeCloseTo(0.5, 10)
  })
})

describe('convexHull', () => {
  it('内側の点を落とす', () => {
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
  it('南から 45° の太陽なら、影は奥へ高さぶん伸びる', () => {
    const sun = sunInLand(45, 180, 90, 0)
    const poly = shadowPolygon(box, sun)!
    const maxY = Math.max(...poly.map((p) => p.y))
    expect(maxY).toBeCloseTo(24, 5)
  })

  it('日が出ていない・高さが無ければ null', () => {
    expect(shadowPolygon(box, { x: 0, y: -1, z: 0 })).toBeNull()
    expect(shadowPolygon({ ...box, height: 0 }, sunInLand(45, 180, 90, 0))).toBeNull()
  })
})

describe('rayHitsBox', () => {
  const south45 = sunInLand(45, 180, 90, 0)

  it('南にある建物の影の中の点は遮られる', () => {
    // 建物の北 3m・窓の高さ 1m。45° なら 9m 先の高さ 10m まで届く前に建物に入る
    expect(rayHitsBox({ x: 2, y: 17, z: 1 }, south45, box)).toBe(true)
  })

  it('影の外（遠い・横にずれる・建物より高い点）は遮られない', () => {
    expect(rayHitsBox({ x: 2, y: 30, z: 1 }, south45, box)).toBe(false)
    expect(rayHitsBox({ x: 10, y: 17, z: 1 }, south45, box)).toBe(false)
    expect(rayHitsBox({ x: 2, y: 17, z: 11 }, south45, box)).toBe(false)
    expect(rayHitsBox({ x: 2, y: 17, z: 1 }, { x: 0, y: -1, z: 0 }, box)).toBe(false)
  })

  it('光線が軸に平行なとき、その軸の範囲の内外で決まる', () => {
    const fromWest = { x: -Math.SQRT1_2, y: 0, z: Math.SQRT1_2 }
    expect(rayHitsBox({ x: 6, y: 12, z: 1 }, fromWest, box)).toBe(true)
    expect(rayHitsBox({ x: 6, y: 20, z: 1 }, fromWest, box)).toBe(false)
  })
})
