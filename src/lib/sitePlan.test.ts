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
  remainingPieces,
  sideDirections,
  round1,
  samePlan,
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

describe('one key order for every plan', () => {
  const reversed = (p: SitePlan): SitePlan =>
    Object.fromEntries(Object.entries(p).reverse()) as unknown as SitePlan
  const neighbor = { label: '北の家', kind: 'building', x: 0, y: 50, width: 8, depth: 6, height: 7 }

  it('returns the keys in the order of the type from normalizePlan and parseSitePlan, whatever came in', () => {
    const order = Object.keys(DEFAULT_SITE_PLAN)
    const p = normalizePlan(reversed({ ...DEFAULT_SITE_PLAN, neighbors: [neighbor as never] }))
    expect(Object.keys(p)).toEqual(order)
    // A value saved before the later items were added: the filled-in keys do not come first
    const { parkingAccess: _p, roadWidth: _r, neighbors: _n, ...old } = DEFAULT_SITE_PLAN
    expect(Object.keys(parseSitePlan(JSON.stringify(old))!)).toEqual(order)
    // What the server stores (keys as received) reads back in the same serialisation
    const stored = JSON.stringify(reversed(p))
    expect(JSON.stringify(parseSitePlan(stored))).toBe(JSON.stringify(p))
    // Neighbours too, and a key the plan does not have is dropped
    const odd = normalizePlan({
      ...DEFAULT_SITE_PLAN,
      extra: 1,
      neighbors: [Object.fromEntries(Object.entries(neighbor).reverse()) as never],
    } as SitePlan)
    expect(Object.keys(odd.neighbors[0]!)).toEqual(Object.keys(neighbor))
    expect(odd).not.toHaveProperty('extra')
  })

  it('compares plans by value with samePlan', () => {
    const p = normalizePlan({ ...DEFAULT_SITE_PLAN, neighbors: [neighbor as never] })
    expect(samePlan(p, reversed(p))).toBe(true)
    expect(samePlan(p, { ...p, buildingX: p.buildingX + 0.5 })).toBe(false)
    expect(samePlan(p, { ...p, neighbors: [{ ...p.neighbors[0]!, height: 9 }] })).toBe(false)
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

describe('remaining land: each piece needs its own 2m link to the road', () => {
  // Lot 18 x 55 m, 100 tsubo = 330.58 ㎡, passage switch off unless stated
  const lot = (o: Partial<SitePlan> = {}) => plan({ landWidth: 18, landDepth: 55, ...o })
  const remain = (p: SitePlan) => check(p, 'remain')

  it('section at the road, land behind: the link is the wider gap beside the section, not the sum', () => {
    // Section 15 m wide, 1.5 m from the left: depth 330.58 / 15 = 22.04 m, so 55 - 22.04 =
    // 32.96 m of land lies behind it (18 x 32.96 = 593.3 ㎡ = 179.5 tsubo). It reaches the
    // road through a 1.5 m gap on the left or a 1.5 m gap on the right: 1.5 m, not 3 m
    const slivers = lot({ sectionWidth: 15, sectionX: 1.5 })
    expect(remainingPieces(slivers)).toEqual([{ where: 'rear', link: 1.5 }])
    expect(remain(slivers).status).toBe('ng')
    expect(remain(slivers).detail).toBe(
      '区画の奥の 179.5坪は、区画の横の幅 1.5m でしか道路につながらない（2m 以上が必要。左右の空きは足せない）',
    )
    // Pushed to the left edge the same section leaves one 3 m gap
    const oneGap = lot({ sectionWidth: 15, sectionX: 0 })
    expect(remainingPieces(oneGap)).toEqual([{ where: 'rear', link: 3 }])
    expect(remain(oneGap).status).toBe('ok')
    expect(remain(oneGap).detail).toBe(
      '199.5坪。区画の奥の土地は、区画の横の幅 3m で道路につながる',
    )
    // Full width: 55 - 330.58 / 18 = 36.63 m behind (659.4 ㎡ = 199.5 tsubo), no gap at all
    const full = lot({ sectionWidth: 18 })
    expect(remainingPieces(full)).toEqual([{ where: 'rear', link: 0 }])
    expect(remain(full).status).toBe('ng')
    expect(remain(full).detail).toBe(
      '区画の奥の 199.5坪が道路に接しなくなる。区画の幅を間口より狭くして、横に 2m 以上の通り道を残す',
    )
  })

  it('the passage to the parking lot is one of the gaps: 1.5 m of passage plus 0.5 m on the other side is not 2 m', () => {
    const p = normalizePlan({
      ...DEFAULT_SITE_PLAN,
      landWidth: 18,
      landDepth: 55,
      accessWidth: 1.5,
      sectionWidth: 16,
      sectionX: 0.5,
    })
    expect(remainingPieces(p)).toEqual([{ where: 'rear', link: 1.5 }])
    expect(remain(p).status).toBe('ng')
    // A passage of exactly 2 m passes (18.3 - 16.3 is 2.0000000000000004 or just under)
    for (const landWidth of [18, 18.3, 9.7]) {
      const ok = normalizePlan({ ...DEFAULT_SITE_PLAN, landWidth, landDepth: 55, accessWidth: 2 })
      expect(remain(ok).status).toBe('ok')
    }
    // 1.96 m must not be printed as "2m" next to "2m 以上が必要"
    const near = lot({ sectionWidth: 16.04, sectionX: 0 })
    expect(remain(near).status).toBe('ng')
    expect(remain(near).detail).toContain('幅 1.96m でしか')
  })

  it('section set back with a flag strip, land behind: the land behind is cut off by a full-width section', () => {
    // Section 18 m wide, 15 m from the road, strip 2.5 m on the left: depth 18.37 m, so
    // 55 - 15 - 18.37 = 21.63 m behind = 389.4 ㎡ = 117.8 tsubo with no way to the road. The
    // 15.5 m in front of the section (right of the strip) touches the road but not the rear
    const cut = lot({ sectionWidth: 18, sectionY: 15, flagWidth: 2.5 })
    expect(remainingPieces(cut)).toEqual([
      { where: 'rear', link: 0 },
      { where: 'right', link: 15.5 },
    ])
    expect(remain(cut).status).toBe('ng')
    expect(remain(cut).detail).toContain('区画の奥の 117.8坪が道路に接しなくなる')
    // 15 m wide at the left edge: the land behind joins the front through the 3 m on the right
    const linked = lot({ sectionWidth: 15, sectionY: 15, flagWidth: 2.5 })
    expect(remainingPieces(linked)).toEqual([{ where: 'rear', link: 3 }])
    expect(remain(linked).status).toBe('ok')
    // 17 m wide: the front has 15.5 m on the road, but the land behind hangs on a 1 m neck
    const neck = lot({ sectionWidth: 17, sectionY: 15, flagWidth: 2.5 })
    expect(remainingPieces(neck)).toEqual([{ where: 'rear', link: 1 }])
    expect(remain(neck).status).toBe('ng')
    expect(remain(neck).detail).toContain('幅 1m でしか')
  })

  it('section set back, land behind: land in front on the side without a gap is a piece of its own', () => {
    // Section 15 m at the left edge (gap 0 left, 3 m right), strip on the right edge of the
    // section. Strip 2.5 m: 12.5 m of frontage left of it, cut off from the rear but fine
    const wide = lot({ sectionWidth: 15, sectionY: 15, flagWidth: 2.5, flagSide: 'right' })
    expect(remainingPieces(wide)).toEqual([
      { where: 'rear', link: 3 },
      { where: 'left', link: 12.5 },
    ])
    expect(remain(wide).status).toBe('ok')
    expect(remain(wide).detail).toBe(
      '188.1坪。区画の奥の土地は、区画の横の幅 3m で道路につながる。手前の土地は道路に 12.5m 接したまま',
    )
    // Strip 14 m: only 1 m is left between the lot edge and the strip
    const sliver = lot({ sectionWidth: 15, sectionY: 15, flagWidth: 14, flagSide: 'right' })
    expect(remainingPieces(sliver)).toEqual([
      { where: 'rear', link: 3 },
      { where: 'left', link: 1 },
    ])
    expect(remain(sliver).status).toBe('ng')
    expect(remain(sliver).detail).toBe('左側に残る土地は道路に 1m しか接しない（2m 以上が必要）')
  })

  it('section set back without a strip: the land in front is one piece', () => {
    const cut = lot({ sectionWidth: 18, sectionY: 15, flagWidth: 0 })
    expect(remainingPieces(cut)).toEqual([
      { where: 'rear', link: 0 },
      { where: 'front', link: 18 },
    ])
    expect(remain(cut).status).toBe('ng')
    const linked = lot({ sectionWidth: 15, sectionY: 15, flagWidth: 0 })
    expect(remainingPieces(linked)).toEqual([{ where: 'rear', link: 3 }])
    expect(remain(linked).status).toBe('ok')
  })

  // Lot 20 x 55 m and 121 tsubo = 400 ㎡: a section 16 m wide is 25 m deep and sits at the
  // rear at exactly 30 m from the road
  const rearLot = (o: Partial<SitePlan> = {}) =>
    plan({ landWidth: 20, landDepth: 55, targetTsubo: 121, sectionWidth: 16, sectionY: 30, ...o })

  it('section at the rear with a flag strip: the land on each side of the strip is judged by its own frontage', () => {
    // At the left edge, strip 2.5 m on the left: everything else is one piece with 17.5 m
    // (1100 - 400 - 2.5 x 30 = 625 ㎡ = 189.1 tsubo)
    const edge = rearLot({ sectionX: 0, flagWidth: 2.5 })
    expect(remainingPieces(edge)).toEqual([{ where: 'right', link: 17.5 }])
    expect(remain(edge).status).toBe('ok')
    expect(remain(edge).detail).toBe('189.1坪。道路に 17.5m 接したまま')
    // 1 m from the left edge: a strip of land 1 m wide and 55 m long is left beside the site
    const sliver = rearLot({ sectionX: 1, flagWidth: 2.5 })
    expect(remainingPieces(sliver)).toEqual([
      { where: 'left', link: 1 },
      { where: 'right', link: 16.5 },
    ])
    expect(remain(sliver).status).toBe('ng')
    expect(remain(sliver).detail).toContain('左側に残る土地は道路に 1m しか接しない')
    // Strip on the right of the section, 3 m from the left: 16.5 m left of the strip, 1 m right
    const right = rearLot({ sectionX: 3, flagWidth: 2.5, flagSide: 'right' })
    expect(remainingPieces(right)).toEqual([
      { where: 'left', link: 16.5 },
      { where: 'right', link: 1 },
    ])
    expect(remain(right).detail).toContain('右側に残る土地は道路に 1m しか接しない')
    // 2 m on each side of a 16 m strip: two pieces, each just enough
    const both = rearLot({ sectionX: 2, flagWidth: 16 })
    expect(remain(both).status).toBe('ok')
    expect(remain(both).detail).toMatch(/。道路に 2m・2m 接したまま$/)
    // Without a strip the land in front is one piece over the whole frontage
    const noStrip = rearLot({ sectionX: 2, flagWidth: 0 })
    expect(remainingPieces(noStrip)).toEqual([{ where: 'front', link: 20 }])
    expect(remain(noStrip).status).toBe('ok')
  })

  it('section from the road to the rear: only the land beside it remains, each side on its own', () => {
    // Lot 20 x 20 m: a 14 m wide section takes the whole depth
    const through = (sectionX: number) =>
      plan({ landWidth: 20, landDepth: 20, targetTsubo: 121, sectionWidth: 14, sectionX })
    expect(remainingPieces(through(3))).toEqual([
      { where: 'left', link: 3 },
      { where: 'right', link: 3 },
    ])
    expect(remain(through(3)).status).toBe('ok')
    expect(remainingPieces(through(1))).toEqual([
      { where: 'left', link: 1 },
      { where: 'right', link: 5 },
    ])
    expect(remain(through(1)).status).toBe('ng')
    expect(remainingPieces(through(0))).toEqual([{ where: 'right', link: 6 }])
    expect(remain(through(0)).status).toBe('ok')
  })

  it('does not take a leftover narrower than the 0.1 m rounding for land', () => {
    // Lot 18.23 m wide. A section pushed to the right ends on the boundary (floating-point
    // noise is not a gap)
    const p = plan({
      landWidth: 18.23,
      landDepth: 20,
      targetTsubo: 121,
      sectionWidth: 15,
      sectionX: 99,
    })
    expect(remainingPieces(p)).toEqual([{ where: 'left', link: p.sectionX }])
    // The width field takes one decimal, so 18.2 m is as wide as the section can be typed:
    // the 3 cm beside it is not judged as a piece of land
    const full = plan({ landWidth: 18.23, landDepth: 20, targetTsubo: 200, sectionWidth: 18.2 })
    expect(full.sectionX).toBe(0)
    expect(remainingPieces(full)).toEqual([])
    expect(remain(full).detail).toBe('残りの土地はありません')
    const front = plan({ landWidth: 18.23, landDepth: 55, sectionWidth: 18.2 })
    expect(remain(front).detail).toContain('道路に接しなくなる')
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

  it('puts the section exactly on the rear boundary: no sliver is left behind it', () => {
    // Defaults (20 x 50 m, 100 tsubo, passage 4 m on): 16 m wide, 20.661 m deep, so the rear
    // position is 29.339 m. Stored as 29.3 it left 3.9 cm "behind", and a 50 m passage appeared
    const back = moveSectionToBack(normalizePlan(DEFAULT_SITE_PLAN))
    expect(back.sectionY + sectionDepth(back)).toBeCloseTo(50, 9)
    expect(accessRect(back)).toBeNull()
    expect(back.sectionWidth).toBe(16)
    expect(check(back, 'parking').detail).toContain('通路は不要')
    expect(remainingPieces(back)).toEqual([{ where: 'right', link: 17.5 }])
    // 8 x 53 m, 43 tsubo, 5.5 m wide: 25.845 m deep, rear position 27.155 m. Rounded up to
    // 27.2 the section stuck out 4.5 cm beyond the land
    const up = plan({
      landWidth: 8,
      landDepth: 53,
      targetTsubo: 43,
      sectionWidth: 5.5,
      sectionY: 53,
    })
    expect(up.sectionY + sectionDepth(up)).toBeCloseTo(53, 9)
    // A position that is not at the rear is still rounded to 0.1 m
    expect(plan({ sectionY: 10.26 }).sectionY).toBe(10.3)
  })

  it('does not reshape a section at the rear when the passage is switched on', () => {
    const off = moveSectionToBack(plan({ landWidth: 18, landDepth: 55, sectionWidth: 18 }))
    const on = normalizePlan({ ...off, parkingAccess: true })
    expect(on.sectionWidth).toBe(18)
    expect(on.sectionY).toBe(off.sectionY)
    expect(accessRect(on)).toBeNull()
  })

  it('keeps the building inside the section and the section inside the land when a position is rounded', () => {
    // Section 20 x 16.529 m, building 14 x 8.264 m: the far position 8.264 is not rounded up to 8.3
    const far = plan({ buildingY: 99, buildingX: 99 })
    expect(far.buildingY + buildingDepth(far)).toBeCloseTo(sectionDepth(far), 9)
    expect(far.buildingX).toBe(6)
    // Lot 18.26 m wide, section 15 m: the far position 3.26 is not rounded up to 3.3; next to a
    // passage of 3.14 m on the left the near position is not rounded down to 3.1
    const wide = plan({ landWidth: 18.26, sectionWidth: 15, sectionX: 99 })
    expect(wide.sectionX).toBeCloseTo(3.26, 9)
    const lane = normalizePlan({
      ...DEFAULT_SITE_PLAN,
      accessSide: 'left',
      accessWidth: 3.14,
      sectionWidth: 10,
      sectionX: 0,
    })
    expect(lane.sectionX).toBe(3.14)
  })
})

describe('normalizePlan over generated plans', () => {
  // Deterministic generator (linear congruential), dimensions in 0.5 m steps as the page gives
  let seed = 12345
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
  const half = (a: number, b: number) => Math.round((a + rnd() * (b - a)) * 2) / 2
  const side = () => (rnd() < 0.5 ? 'left' : 'right')
  const generate = (): SitePlan => {
    const landWidth = half(8, 30)
    const landDepth = half(20, 70)
    const where = rnd()
    return {
      ...DEFAULT_SITE_PLAN,
      landWidth,
      landDepth,
      targetTsubo: Math.round(40 + rnd() * 120),
      sectionWidth: half(4, landWidth),
      sectionX: half(0, landWidth),
      sectionY: where < 0.3 ? 0 : where < 0.6 ? landDepth : half(0, landDepth),
      flagWidth: half(0, 5),
      flagSide: side(),
      parkingAccess: rnd() < 0.6,
      accessWidth: half(0, 6),
      accessSide: side(),
      floors: rnd() < 0.5 ? 1 : 2,
      buildingTsubo: Math.round(20 + rnd() * 40),
      buildingWidth: half(5, 16),
      buildingX: half(0, 10),
      buildingY: half(0, 30),
    }
  }
  const overlap = (a: { x: number; y: number; width: number; depth: number }, b: typeof a) =>
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y))

  it('is idempotent and keeps the section, the passage and the building apart and inside', () => {
    const failures: string[] = []
    for (let i = 0; i < 20000; i++) {
      const p = normalizePlan(generate())
      const fail = (what: string) => failures.push(`${what}: ${JSON.stringify(p)}`)
      if (JSON.stringify(normalizePlan(p)) !== JSON.stringify(p)) fail('not idempotent')
      const s = sectionRect(p)
      const b = buildingRect(p)
      const lane = accessRect(p)
      const flag = flagRect(p)
      if (s.x < 0 || s.x + s.width > p.landWidth + 1e-9) fail('section outside the land (x)')
      if (s.y + s.depth > p.landDepth + 1e-9) fail('section beyond the rear')
      if (lane && overlap(lane, s) > 1e-6) fail('passage overlaps the section')
      if (lane && flag && overlap(lane, flag) > 1e-6) fail('passage overlaps the flag strip')
      if (lane && p.landDepth - s.y - s.depth < 0.05) fail('passage without land behind')
      if (b.depth <= s.depth && b.y + b.depth > s.y + s.depth + 1e-9) fail('building beyond rear')
      if (b.x + b.width > s.x + s.width + 1e-9) fail('building beyond the right edge')
    }
    expect(failures.slice(0, 3)).toEqual([])
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

  it('counts 24 lit ten-minute steps as exactly 4 hours, which meets the 4-hour guide', () => {
    // A building 6 m above window height, 11.3 m south of the wall and as wide as the view,
    // blocks the sun while its profile angle is under atan(6 / 11.3) = 27.97° (tan 0.531). On
    // the winter solstice at 35.5°N the tangent of the profile angle is 0.523 at 9:55, 0.536 at
    // 10:05 and the same mirrored at 13:55 / 14:05: lit for the 24 steps from 10:05 to 13:55,
    // blocked for the other 24. Adding 1/6 h per step gave 3.9999999999999982 -> "warn"
    const p = normalizePlan({
      ...DEFAULT_SITE_PLAN,
      landWidth: 18,
      landDepth: 55,
      sectionWidth: 14,
      buildingWidth: 10,
      buildingX: 2,
      buildingY: 4,
      neighbors: [{ ...tall, x: -500, y: 4 - 11.3 - 10, width: 1000, depth: 10, height: 7 }],
    })
    const r = sunOnSouthWall(p)
    expect(r.hours).toEqual([4, 4, 4, 4, 4])
    expect(r.min).toBe(4)
    expect(r.average).toBe(4)
    expect(r.blockers).toEqual([{ label: '南の建物', hours: 4 }])
    const c = check(p, 'sun')
    expect(c.status).toBe('ok')
    expect(c.detail).toContain('短い所で 4時間')
    // One step less is under the guide
    const closer = { ...p, neighbors: [{ ...p.neighbors[0]!, y: 4 - 11 - 10 }] }
    expect(sunOnSouthWall(closer).min).toBeLessThan(4)
    expect(check(closer, 'sun').status).toBe('warn')
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
