import { describe, expect, it } from 'vitest'

import { UNKNOWN_HEIGHT, buildScene, northDirection3d, sunDirection3d, toThree } from './site3d'
import { DEFAULT_SITE_PLAN, normalizePlan, type Neighbor, type SitePlan } from './sitePlan'

const plan = (o: Partial<SitePlan> = {}): SitePlan =>
  normalizePlan({ ...DEFAULT_SITE_PLAN, parkingAccess: false, ...o })

const nb = (o: Partial<Neighbor>): Neighbor => ({
  label: '隣',
  kind: 'building',
  x: -10,
  y: 5,
  width: 8,
  depth: 10,
  height: 7,
  ...o,
})

describe('buildScene', () => {
  it('places the road, land, section and single-story house (no passage or flag-lot access strip when absent)', () => {
    const s = buildScene(plan())
    expect(s.planes.map((p) => p.kind)).toEqual(['road', 'land', 'section'])
    expect(s.boxes).toHaveLength(1)
    expect(s.boxes[0]).toMatchObject({ kind: 'house', height: 4.5, label: '平屋 35坪' })
    expect(buildScene(plan({ floors: 2 })).boxes[0]!.label).toBe('2 階建て 35坪')
    expect(s.bounds).toEqual({ minX: 0, maxX: 20, minY: -4, maxY: 50 })
  })

  it('also places the passage to the parking lot and the flag-lot access strip of the rear section as planes', () => {
    const s = buildScene(plan({ parkingAccess: true, sectionWidth: 14, sectionY: 20 }))
    expect(s.planes.map((p) => p.kind)).toEqual(['road', 'land', 'access', 'section', 'flag'])
  })

  it('neighbors: open land is a plane, a building is a box. Unknown height uses a provisional height, and the road spans the scene width', () => {
    const s = buildScene(
      plan({
        neighbors: [
          nb({ label: '集合住宅', height: 12 }),
          nb({ label: '建設中', kind: 'construction', x: 20, height: 7 }),
          nb({ label: '不明', x: 30, height: 0 }),
          nb({ label: '校庭', kind: 'open', x: -5, y: -30, width: 40, depth: 25 }),
        ],
      }),
    )
    expect(s.boxes.map((b) => [b.kind, b.height])).toEqual([
      ['building', 12],
      ['construction', 7],
      ['unknown', UNKNOWN_HEIGHT],
      ['house', 4.5],
    ])
    expect(s.planes.find((p) => p.kind === 'open')?.label).toBe('校庭')
    expect(s.bounds).toEqual({ minX: -10, maxX: 38, minY: -30, maxY: 50 })
    expect(s.planes[0]).toMatchObject({ kind: 'road', x: -10, width: 48 })
  })
})

describe('coordinates', () => {
  it('maps the rear of the land to -Z and height to Y', () => {
    expect(toThree({ x: 1, y: 2, z: 3 })).toEqual([1, 3, -2])
  })

  it('north direction: the rear (-Z) when the road is to the south, slightly right when rotated toward the east', () => {
    const [x, z] = northDirection3d(plan())
    expect(x).toBeCloseTo(0, 10)
    expect(z).toBeCloseTo(-1, 10)
    const [x2] = northDirection3d(plan({ facingOffset: -10 }))
    expect(x2).toBeGreaterThan(0)
  })

  it('sun: at culmination on the winter solstice it comes from above the front (+Z). null at night', () => {
    const noon = sunDirection3d(plan(), 'winter', 12)!
    expect(noon.altitude).toBeCloseTo(31.06, 1)
    expect(noon.dir[1]).toBeGreaterThan(0)
    expect(noon.dir[2]).toBeGreaterThan(0)
    expect(sunDirection3d(plan(), 'winter', 3)).toBeNull()
  })
})
