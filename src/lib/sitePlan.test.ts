import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SITE_PLAN,
  M2_PER_TSUBO,
  PARKING_M2_PER_CAR,
  accessRect,
  ROAD_SIDE_LABEL,
  buildingDepth,
  buildingFootprint,
  buildingLabel,
  buildingRect,
  effectiveFloorAreaRatio,
  evaluateSite,
  fireSafeRect,
  formatLotLines,
  landAxes,
  lotsTouched,
  shadingBoxes,
  sunOnSouthWall,
  NEIGHBORS_MAX,
  flagRect,
  m2ToTsubo,
  moveSectionToBack,
  moveSectionToFront,
  normalizePlan,
  northAngle,
  parseLotLines,
  parseSitePlan,
  placeBuildingNorth,
  sideDirections,
  round1,
  sectionDepth,
  sectionRect,
  southGap,
  tsuboToM2,
  type SitePlan,
} from './sitePlan'

// The existing geometry and check tests run with the passage to the parking lot turned off
// (the passage is covered in the describe below)
const plan = (overrides: Partial<SitePlan> = {}): SitePlan =>
  normalizePlan({ ...DEFAULT_SITE_PLAN, parkingAccess: false, ...overrides })
const check = (p: SitePlan, id: string) => evaluateSite(p).checks.find((c) => c.id === id)!

describe('tsubo and ㎡', () => {
  it('round-trips with 1 tsubo = 400/121 ㎡', () => {
    expect(tsuboToM2(121)).toBeCloseTo(400)
    expect(m2ToTsubo(400)).toBeCloseTo(121)
    expect(M2_PER_TSUBO).toBeCloseTo(3.3058, 4)
  })

  it('rounds to units of 0.1 m with round1', () => {
    expect(round1(1.26)).toBe(1.3)
    expect(round1(1.24)).toBe(1.2)
  })

  it('has compass direction labels', () => {
    expect(ROAD_SIDE_LABEL.S).toBe('南')
  })
})

describe('parseSitePlan', () => {
  it('reads valid JSON and fits out-of-range values', () => {
    const raw = JSON.stringify({ ...DEFAULT_SITE_PLAN, sectionX: 99 })
    expect(parseSitePlan(raw)?.sectionX).toBe(0)
  })

  it('returns null for broken values', () => {
    expect(parseSitePlan(null)).toBeNull()
    expect(parseSitePlan(undefined)).toBeNull()
    expect(parseSitePlan('')).toBeNull()
    expect(parseSitePlan('{broken')).toBeNull()
    expect(parseSitePlan('[]')).toBeNull()
    expect(parseSitePlan(JSON.stringify({ ...DEFAULT_SITE_PLAN, version: 2 }))).toBeNull()
    expect(parseSitePlan(JSON.stringify({ ...DEFAULT_SITE_PLAN, landWidth: '20' }))).toBeNull()
    expect(parseSitePlan(JSON.stringify({ ...DEFAULT_SITE_PLAN, landWidth: null }))).toBeNull()
    expect(parseSitePlan(JSON.stringify({ ...DEFAULT_SITE_PLAN, roadSide: 'X' }))).toBeNull()
    expect(parseSitePlan(JSON.stringify({ ...DEFAULT_SITE_PLAN, flagSide: 'top' }))).toBeNull()
    expect(parseSitePlan(JSON.stringify({ ...DEFAULT_SITE_PLAN, parkingAccess: 'yes' }))).toBeNull()
    expect(parseSitePlan(JSON.stringify({ ...DEFAULT_SITE_PLAN, accessSide: 'top' }))).toBeNull()
  })

  it('fills in defaults for an old saved value without the passage to the parking lot', () => {
    const { parkingAccess: _p, accessWidth: _w, accessSide: _s, ...old } = DEFAULT_SITE_PLAN
    const parsed = parseSitePlan(JSON.stringify(old))
    expect(parsed?.parkingAccess).toBe(true)
    expect(parsed?.accessWidth).toBe(4)
    expect(parsed?.accessSide).toBe('right')
  })

  it('also fills in defaults for an old saved value without road width, quasi-fire-prevention flag and parcel boundaries, and returns null for a wrong shape', () => {
    const { roadWidth: _r, quasiFireZone: _q, lotLines: _l, ...old } = DEFAULT_SITE_PLAN
    const parsed = parseSitePlan(JSON.stringify(old))
    expect(parsed?.roadWidth).toBe(4)
    expect(parsed?.quasiFireZone).toBe(false)
    expect(parsed?.lotLines).toEqual([])
    expect(parseSitePlan(JSON.stringify({ ...DEFAULT_SITE_PLAN, quasiFireZone: 1 }))).toBeNull()
    expect(parseSitePlan(JSON.stringify({ ...DEFAULT_SITE_PLAN, lotLines: 10.5 }))).toBeNull()
    expect(parseSitePlan(JSON.stringify({ ...DEFAULT_SITE_PLAN, lotLines: ['10.5'] }))).toBeNull()
  })
})

describe('geometry', () => {
  it('computes the section depth as target area / width, not exceeding the depth of the land', () => {
    expect(sectionDepth(plan({ sectionWidth: 20, targetTsubo: 100 }))).toBeCloseTo(
      tsuboToM2(100) / 20,
    )
    expect(sectionDepth(plan({ landDepth: 10, sectionWidth: 20, targetTsubo: 100 }))).toBe(10)
  })

  it('fits the section inside the land and the building inside the section with normalizePlan', () => {
    const p = plan({
      sectionWidth: 99,
      sectionY: 999,
      buildingWidth: 99,
      buildingY: 999,
      flagWidth: 99,
    })
    expect(p.sectionWidth).toBe(20)
    expect(p.sectionY + sectionDepth(p)).toBeCloseTo(50, 0)
    expect(p.buildingWidth).toBe(20)
    expect(p.flagWidth).toBe(20)
    expect(p.buildingY + buildingDepth(p)).toBeLessThanOrEqual(sectionDepth(p) + 0.05)
    const tiny = normalizePlan({ ...DEFAULT_SITE_PLAN, landWidth: 0, landDepth: 0 })
    expect(tiny.landWidth).toBe(1)
    expect(tiny.landDepth).toBe(1)
  })

  it('has no flag-lot access strip when the section touches the road. At the rear it attaches to the left or right edge', () => {
    expect(flagRect(plan())).toBeNull()
    const back = plan({ sectionWidth: 12, sectionX: 4, sectionY: 20, flagWidth: 3 })
    expect(flagRect(back)).toEqual({ x: 4, y: 0, width: 3, depth: 20 })
    expect(flagRect({ ...back, flagSide: 'right' })).toEqual({ x: 13, y: 0, width: 3, depth: 20 })
    expect(flagRect({ ...back, flagWidth: 0 })).toBeNull()
  })

  it('returns the section and building rectangles in the land coordinate system', () => {
    const p = plan({ sectionX: 0, sectionY: 5, buildingX: 2, buildingY: 3 })
    expect(sectionRect(p)).toMatchObject({ x: 0, y: 5, width: 20 })
    expect(buildingRect(p)).toMatchObject({ x: 2, y: 8, width: 14 })
  })
})

describe('compass directions', () => {
  const base = { sectionWidth: 20, buildingWidth: 10, buildingX: 2, buildingY: 3 }
  it('measures the open space on the south side from a different edge depending on the direction of the road', () => {
    const s = plan({ ...base, roadSide: 'S' })
    expect(southGap(s)).toBe(3)
    const n = plan({ ...base, roadSide: 'N' })
    expect(southGap(n)).toBeCloseTo(sectionDepth(n) - 3 - buildingDepth(n))
    expect(southGap(plan({ ...base, roadSide: 'E' }))).toBe(2)
    expect(southGap(plan({ ...base, roadSide: 'W' }))).toBe(8)
  })

  it('returns the direction of north', () => {
    expect([northAngle('S'), northAngle('N'), northAngle('E'), northAngle('W')]).toEqual([
      0, 180, 90, 270,
    ])
  })

  it('moves the building with placeBuildingNorth to the edge that maximizes the open space on the south side', () => {
    for (const roadSide of ['S', 'N', 'E', 'W'] as const) {
      const p = placeBuildingNorth(plan({ roadSide, buildingWidth: 10 }))
      const others = [
        p.buildingX,
        p.buildingY,
        p.sectionWidth - p.buildingX - p.buildingWidth,
        sectionDepth(p) - p.buildingY - buildingDepth(p),
      ]
      // The margin on the side opposite south (north) equals the setback from the boundary =
      // it is pushed to the north
      expect(Math.min(...others)).toBeGreaterThanOrEqual(p.setback)
      expect(Math.min(...others)).toBeLessThan(p.setback + 0.1)
      expect(check(p, 'setback').status).toBe('ok')
      expect(southGap(p)).toBeGreaterThan(3.5)
    }
  })
})

describe('evaluateSite', () => {
  it('front, full-width section: area and road frontage are OK, and the remaining land loses road frontage', () => {
    const p = plan({ sectionWidth: 20, sectionY: 0 })
    const e = evaluateSite(p)
    expect(m2ToTsubo(e.sectionArea)).toBeCloseTo(100)
    expect(e.flagArea).toBe(0)
    expect(check(p, 'area').status).toBe('ok')
    expect(check(p, 'road').status).toBe('ok')
    expect(check(p, 'remain').status).toBe('ng')
    expect(e.landArea).toBe(1000)
  })

  it('keeps the remaining land touching the road for a front section narrower than the frontage', () => {
    expect(check(plan({ sectionWidth: 14 }), 'remain').status).toBe('ok')
  })

  it('rear section: the area of the flag-lot access strip is added to the site, and road frontage is judged by its width', () => {
    const p = plan({ sectionWidth: 17, sectionX: 3, sectionY: 25, flagWidth: 3, flagSide: 'left' })
    const e = evaluateSite(p)
    expect(e.flagArea).toBeCloseTo(75)
    expect(e.siteArea).toBeCloseTo(e.sectionArea + 75)
    expect(check(p, 'road').status).toBe('ok')
    // The Kanagawa Prefecture ordinance adds no extra width for the length of the passage: even
    // at a length of 25m the legal 2m is enough (a car cannot enter)
    expect(check({ ...p, flagWidth: 2.5 }, 'road').status).toBe('warn')
    expect(check({ ...p, flagWidth: 1.5 }, 'road').status).toBe('ng')
    expect(check(p, 'remain').status).toBe('ok')
  })

  it('fails road frontage when the section is at the rear but the flag-lot access strip width is 0', () => {
    const p = plan({ sectionY: 20, flagWidth: 0 })
    expect(check(p, 'road').status).toBe('ng')
  })

  it('fails road frontage for a section with a frontage under 2m', () => {
    const p = normalizePlan({
      ...DEFAULT_SITE_PLAN,
      landWidth: 1.5,
      sectionWidth: 1.5,
      buildingWidth: 1,
    })
    expect(check(p, 'road').status).toBe('ng')
  })

  it('warns on area when the depth is not enough', () => {
    expect(check(plan({ landDepth: 10 }), 'area').status).toBe('warn')
  })

  it('leaves no remaining land when everything is used', () => {
    const p = plan({ landWidth: 20, landDepth: tsuboToM2(100) / 20 })
    expect(check(p, 'remain').detail).toContain('ありません')
  })

  it('checks building coverage ratio, floor area ratio, exterior wall setback and open space on the south side', () => {
    const p = plan({ buildingTsubo: 35, coverageRatio: 50, floorAreaRatio: 100 })
    const e = evaluateSite(p)
    expect(e.coverageUsed).toBeCloseTo((tsuboToM2(35) / e.siteArea) * 100)
    expect(e.floorAreaUsed).toBe(e.coverageUsed)
    expect(check(p, 'coverage').status).toBe('ok')
    expect(check(p, 'floorArea').status).toBe('ok')
    expect(check({ ...p, coverageRatio: 30 }, 'coverage').status).toBe('ng')
    expect(check({ ...p, floorAreaRatio: 30 }, 'floorArea').status).toBe('ng')
    expect(check(p, 'setback').status).toBe('ok')
    expect(check({ ...p, buildingX: 0 }, 'setback').status).toBe('warn')
    expect(check({ ...p, buildingY: 5 }, 'south').status).toBe('ok')
    expect(check({ ...p, buildingY: 1, roadWidth: 0 }, 'south').status).toBe('warn')
  })

  it('also counts the road width as open space to the south when the south of the section is the road', () => {
    const p = plan({ roadSide: 'S', sectionY: 0, buildingY: 1, roadWidth: 5 })
    expect(check(p, 'south').status).toBe('ok')
    expect(check(p, 'south').detail).toContain('道路 5m')
    // For a rear section the road is not counted
    const back = plan({ roadSide: 'S', sectionY: 20, buildingY: 1, roadWidth: 5 })
    expect(check(back, 'south').status).toBe('warn')
  })

  it('uses the smaller of front road width x 0.4 and the designated value as the floor area ratio', () => {
    expect(effectiveFloorAreaRatio(plan({ floorAreaRatio: 200, roadWidth: 4 }))).toBe(160)
    expect(effectiveFloorAreaRatio(plan({ floorAreaRatio: 200, roadWidth: 5 }))).toBe(200)
    expect(effectiveFloorAreaRatio(plan({ floorAreaRatio: 200, roadWidth: 12 }))).toBe(200)
    const narrow = plan({ floorAreaRatio: 200, roadWidth: 4 })
    expect(evaluateSite(narrow).floorAreaLimit).toBe(160)
    expect(check(narrow, 'floorArea').detail).toContain('×0.4')
    expect(check(plan({ roadWidth: 5 }), 'floorArea').detail).not.toContain('×0.4')
  })
})

describe('quasi-fire-prevention district (the part at risk of fire spread)', () => {
  const fire = (o: Partial<SitePlan> = {}) =>
    plan({ quasiFireZone: true, sectionWidth: 20, roadWidth: 5, ...o })

  it('puts the fire-spread line 3m from adjacent land, and on the road side 3m from the road center line', () => {
    const p = fire({ sectionY: 0 })
    expect(fireSafeRect(p)).toEqual({
      x: 3,
      y: 0.5,
      width: 14,
      depth: sectionDepth(p) - 0.5 - 3,
    })
    // For a rear section the front is also adjacent land
    expect(fireSafeRect(fire({ sectionY: 10 })).y).toBe(3)
    // With a road width of 6m or more, the fire-spread line on the road side is outside the boundary
    expect(fireSafeRect(fire({ sectionY: 0, roadWidth: 8 })).y).toBe(0)
    // In a narrow section the inside disappears
    expect(fireSafeRect(fire({ sectionWidth: 5 })).width).toBe(0)
  })

  it('reports by compass direction the sides where the building crosses the fire-spread line', () => {
    const p = fire({ buildingWidth: 10, buildingX: 1, buildingY: 3 })
    const c = check(p, 'fire')
    expect(c.status).toBe('warn')
    expect(c.detail).toContain('西')
    expect(c.detail).not.toContain('東')
    // Crosses at the rear and the right
    const q = fire({ buildingWidth: 14, buildingX: 5, buildingY: 99 })
    expect(check(q, 'fire').detail).toContain('北・東')
    // Crosses at the front (rear section)
    const r = fire({ sectionY: 10, buildingWidth: 10, buildingX: 5, buildingY: 1 })
    expect(check(r, 'fire').detail).toContain('南')
  })

  it('is OK when the building fits inside the fire-spread line, and is not checked outside a quasi-fire-prevention district', () => {
    const p = fire({ buildingTsubo: 20, buildingWidth: 10, buildingX: 5, buildingY: 5 })
    expect(check(p, 'fire').status).toBe('ok')
    expect(evaluateSite(plan()).checks.find((c) => c.id === 'fire')).toBeUndefined()
  })

  it('maps sides to compass directions', () => {
    expect(sideDirections('S')).toEqual({ front: '南', back: '北', left: '西', right: '東' })
    expect(sideDirections('N').front).toBe('北')
    expect(sideDirections('E').right).toBe('北')
    expect(sideDirections('W').left).toBe('北')
  })
})

describe('parcel boundaries', () => {
  it('reads and writes the input text', () => {
    expect(parseLotLines('10.5, 20')).toEqual([10.5, 20])
    expect(parseLotLines('10.5、20 abc')).toEqual([10.5, 20])
    expect(parseLotLines('')).toEqual([])
    expect(formatLotLines([10.5, 20])).toBe('10.5, 20')
  })

  it('keeps only those inside the land, ascending and without duplicates', () => {
    expect(plan({ lotLines: [15, 10.54, 10.5, 0, 20, -1, 30] }).lotLines).toEqual([10.5, 15])
  })

  it('counts the parcels the section spans', () => {
    const base = { lotLines: [10.5], sectionWidth: 9, targetTsubo: 60 }
    const one = plan({ ...base, sectionX: 0 })
    expect(lotsTouched(one)).toEqual([0])
    expect(check(one, 'lots').status).toBe('ok')
    expect(check(one, 'lots').detail).toContain('左から 1 筆目')
    const two = plan({ ...base, sectionX: 5 })
    expect(lotsTouched(two)).toEqual([0, 1])
    expect(check(two, 'lots').status).toBe('warn')
    expect(evaluateSite(plan()).checks.find((c) => c.id === 'lots')).toBeUndefined()
  })
})

describe('moving the section', () => {
  it('moves to the front and to the rear', () => {
    expect(moveSectionToFront(plan({ sectionY: 10 })).sectionY).toBe(0)
    const back = moveSectionToBack(plan())
    expect(back.sectionY + sectionDepth(back)).toBeCloseTo(50, 0)
  })
})

describe('passage to the parking lot', () => {
  const withAccess = (overrides: Partial<SitePlan> = {}) =>
    normalizePlan({ ...DEFAULT_SITE_PLAN, ...overrides })

  it('tightens the width and position of a front section to avoid the passage strip, and lengthens the depth', () => {
    const right = withAccess({ sectionWidth: 20, sectionY: 0, accessSide: 'right', accessWidth: 4 })
    expect(right.sectionWidth).toBe(16)
    expect(right.sectionX).toBe(0)
    expect(sectionDepth(right)).toBeCloseTo(tsuboToM2(100) / 16)
    expect(accessRect(right)).toEqual({ x: 16, y: 0, width: 4, depth: sectionDepth(right) })

    const left = withAccess({ sectionWidth: 20, sectionX: 0, accessSide: 'left', accessWidth: 4 })
    expect(left.sectionX).toBe(4)
    expect(accessRect(left)?.x).toBe(0)
  })

  it('has no passage and does not tighten the section when the section reaches the rear of the land', () => {
    const back = withAccess({ sectionWidth: 20, sectionY: 999 })
    expect(back.sectionWidth).toBe(20)
    expect(accessRect(back)).toBeNull()
    const e = evaluateSite(back)
    expect(e.accessArea).toBe(0)
    const c = e.checks.find((x) => x.id === 'parking')!
    expect(c.status).toBe('ok')
    expect(c.detail).toContain('不要')
  })

  it('has no passage when the passage is turned off or the width is 0', () => {
    expect(accessRect(withAccess({ parkingAccess: false }))).toBeNull()
    expect(accessRect(withAccess({ accessWidth: 0 }))).toBeNull()
    expect(
      evaluateSite(withAccess({ parkingAccess: false })).checks.some((c) => c.id === 'parking'),
    ).toBe(false)
  })

  it('check: OK at a width of 4m or more, warning when narrow. The area is included in the remaining land, and the number of cars is estimated', () => {
    const p = withAccess({ accessWidth: 4 })
    const e = evaluateSite(p)
    const c = e.checks.find((x) => x.id === 'parking')!
    expect(c.status).toBe('ok')
    expect(e.accessArea).toBeCloseTo(4 * sectionDepth(p))
    expect(c.detail).toContain(`${Math.floor(e.remainingArea / PARKING_M2_PER_CAR)} 台`)
    expect(check(withAccess({ accessWidth: 3 }), 'parking').status).toBe('warn')
    // With the passage the remaining land also keeps touching the road
    expect(check(p, 'remain').status).toBe('ok')
  })

  it('fits the passage width to at least 1m narrower than the frontage of the land', () => {
    expect(withAccess({ accessWidth: 99 }).accessWidth).toBe(19)
  })
})

describe('adjacent land, orientation and sunlight', () => {
  const tall = {
    label: '南の建物',
    kind: 'building' as const,
    x: 0,
    y: -12,
    width: 20,
    depth: 6,
    height: 15,
  }
  const base = (o: Partial<SitePlan> = {}) =>
    plan({ roadSide: 'S', sectionWidth: 20, buildingWidth: 10, buildingX: 5, buildingY: 3, ...o })

  it('fills in defaults for an old saved value, and returns null for a neighbor of the wrong shape', () => {
    const {
      facingOffset: _f,
      latitude: _l,
      buildingHeight: _b,
      neighbors: _n,
      ...old
    } = DEFAULT_SITE_PLAN
    const parsed = parseSitePlan(JSON.stringify(old))!
    expect(parsed.neighbors).toEqual([])
    expect(parsed.latitude).toBe(35.5)
    const bad = (neighbors: unknown) =>
      parseSitePlan(JSON.stringify({ ...DEFAULT_SITE_PLAN, neighbors }))
    expect(bad([tall])?.neighbors).toHaveLength(1)
    expect(bad('x')).toBeNull()
    expect(bad([1])).toBeNull()
    expect(bad([{ ...tall, label: 1 }])).toBeNull()
    expect(bad([{ ...tall, kind: 'tower' }])).toBeNull()
    expect(bad([{ ...tall, height: '9' }])).toBeNull()
  })

  it('fits the neighbor values', () => {
    const p = plan({
      facingOffset: 90,
      latitude: 0,
      buildingHeight: 50,
      neighbors: [
        { ...tall, label: 'あ'.repeat(60), width: 0, depth: -1, height: 999 },
        ...Array.from({ length: NEIGHBORS_MAX + 5 }, () => tall),
      ],
    })
    expect(p.facingOffset).toBe(45)
    expect(p.latitude).toBe(20)
    expect(p.buildingHeight).toBe(15)
    expect(p.neighbors).toHaveLength(NEIGHBORS_MAX)
    expect(p.neighbors[0]).toMatchObject({ width: 0.5, depth: 0.5, height: 100 })
    expect(p.neighbors[0]!.label).toHaveLength(40)
  })

  it('derives the azimuths of the land axes from the direction of the road and the orientation deviation', () => {
    expect(landAxes(base())).toEqual({ rightAz: 90, backAz: 0 })
    expect(landAxes(base({ facingOffset: -10 }))).toEqual({ rightAz: 80, backAz: 350 })
    expect(landAxes(base({ roadSide: 'N' }))).toEqual({ rightAz: 270, backAz: 180 })
    expect(landAxes(base({ roadSide: 'E' }))).toEqual({ rightAz: 0, backAz: 270 })
  })

  it('includes only buildings with a known height in the sunlight calculation', () => {
    const p = base({
      neighbors: [
        tall,
        { ...tall, label: '不明', height: 0 },
        { ...tall, label: '駐車場', kind: 'open' },
        { ...tall, label: '建設中', kind: 'construction' },
      ],
    })
    expect(shadingBoxes(p).map((b) => b.label)).toEqual(['南の建物', '建設中'])
  })

  it('gets sun all through 8:00 to 16:00 on the winter solstice when there are no buildings around', () => {
    const r = sunOnSouthWall(base())
    expect(r.wall).toBe('南')
    expect(r.min).toBeCloseTo(8, 5)
    expect(r.blockers).toEqual([])
    expect(check(base(), 'sun').status).toBe('ok')
    expect(check(base(), 'sun').detail).toContain('かからない')
  })

  it('blocks the winter sun with a tall building to the south, and reports its name and the time', () => {
    const p = base({ neighbors: [tall] })
    const r = sunOnSouthWall(p)
    expect(r.min).toBeLessThan(4)
    expect(r.blockers[0]!.label).toBe('南の建物')
    const c = check(p, 'sun')
    expect(c.status).toBe('warn')
    expect(c.detail).toContain('南の建物')
    // With 2 buildings the one that blocks longer comes first
    const two = sunOnSouthWall(
      base({ neighbors: [{ ...tall, label: '低い', height: 6, x: -30, width: 28 }, tall] }),
    )
    expect(two.blockers.map((b) => b.label)).toEqual(['南の建物', '低い'])
    // In summer the sun is high and the shadow does not reach
    expect(sunOnSouthWall(p, 'summer').blockers).toEqual([])
  })

  it('does not hit the south window in the morning and evening of the summer solstice, when the sun is toward the north', () => {
    expect(sunOnSouthWall(base(), 'summer').min).toBeLessThan(8)
  })

  it('changes the south-facing exterior wall with the direction of the road', () => {
    expect(sunOnSouthWall(base({ roadSide: 'N' })).wall).toBe('南')
    expect(sunOnSouthWall(base({ roadSide: 'E' })).wall).toBe('南')
    expect(sunOnSouthWall(base({ roadSide: 'W' })).wall).toBe('南')
    // When the road is to the east and rotated a lot, the wall closest to south is the front one
    expect(sunOnSouthWall(base({ roadSide: 'E', facingOffset: 45 })).wall).toBe('東')
  })

  it('does not count time when the sun is not up, as in a polar night', () => {
    expect(sunOnSouthWall({ ...base(), latitude: 80 }).min).toBe(0)
  })
})

describe('number of floors (single-story, two-story)', () => {
  it('defaults to single-story. Fills in single-story for an old saved value, and returns null for anything other than 1 or 2', () => {
    expect(DEFAULT_SITE_PLAN.floors).toBe(1)
    const { floors: _f, ...old } = DEFAULT_SITE_PLAN
    expect(parseSitePlan(JSON.stringify(old))?.floors).toBe(1)
    expect(parseSitePlan(JSON.stringify({ ...DEFAULT_SITE_PLAN, floors: 2 }))?.floors).toBe(2)
    expect(parseSitePlan(JSON.stringify({ ...DEFAULT_SITE_PLAN, floors: 3 }))).toBeNull()
  })

  it('two-story: the footprint is half the total floor area (full two-story). Coverage uses the footprint, floor area ratio uses the total floor area', () => {
    const one = plan({ buildingTsubo: 40, buildingWidth: 10 })
    const two = plan({ buildingTsubo: 40, buildingWidth: 10, floors: 2 })
    expect(buildingFootprint(two)).toBeCloseTo(buildingFootprint(one) / 2)
    expect(buildingDepth(two)).toBeCloseTo(buildingDepth(one) / 2)
    const e = evaluateSite(two)
    expect(e.floorAreaUsed).toBeCloseTo(e.coverageUsed * 2)
    expect(buildingLabel(one)).toBe('平屋 40坪')
    expect(buildingLabel(two)).toBe('2 階建て 40坪')
  })

  it('reports the fire-spread line of a two-story house separately for the 1st floor at 3m and the 2nd floor at 5m', () => {
    const p = plan({
      quasiFireZone: true,
      floors: 2,
      sectionWidth: 20,
      roadWidth: 5,
      buildingTsubo: 30,
      buildingWidth: 10,
      buildingX: 4,
      buildingY: 6,
    })
    const c = check(p, 'fire')
    expect(c.status).toBe('warn')
    expect(c.detail).toContain('2 階は西側の外壁が 5m 以内')
    expect(c.detail).not.toContain('1 階は')
    const q = { ...p, buildingX: 1 }
    expect(check(q, 'fire').detail).toContain('1 階は西側の外壁が 3m 以内')
    // For a single-story house with the same footprint the 5m line is not looked at
    expect(check({ ...p, floors: 1, buildingTsubo: 15 }, 'fire').status).toBe('ok')
  })
})
