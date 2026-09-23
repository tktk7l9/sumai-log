import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SITE_PLAN,
  M2_PER_TSUBO,
  ROAD_SIDE_LABEL,
  buildingDepth,
  buildingRect,
  evaluateSite,
  flagRect,
  m2ToTsubo,
  moveSectionToBack,
  moveSectionToFront,
  normalizePlan,
  northAngle,
  parseSitePlan,
  placeBuildingNorth,
  requiredFlagWidth,
  round1,
  sectionDepth,
  sectionRect,
  southGap,
  tsuboToM2,
  type SitePlan,
} from './sitePlan'

const plan = (overrides: Partial<SitePlan> = {}): SitePlan =>
  normalizePlan({ ...DEFAULT_SITE_PLAN, ...overrides })
const check = (p: SitePlan, id: string) => evaluateSite(p).checks.find((c) => c.id === id)!

describe('坪と㎡', () => {
  it('1 坪 = 400/121 ㎡ で往復できる', () => {
    expect(tsuboToM2(121)).toBeCloseTo(400)
    expect(m2ToTsubo(400)).toBeCloseTo(121)
    expect(M2_PER_TSUBO).toBeCloseTo(3.3058, 4)
  })

  it('round1 は 0.1 m 単位', () => {
    expect(round1(1.26)).toBe(1.3)
    expect(round1(1.24)).toBe(1.2)
  })

  it('方角のラベル', () => {
    expect(ROAD_SIDE_LABEL.S).toBe('南')
  })
})

describe('parseSitePlan', () => {
  it('正しい JSON を読み、範囲外は収める', () => {
    const raw = JSON.stringify({ ...DEFAULT_SITE_PLAN, sectionX: 99 })
    expect(parseSitePlan(raw)?.sectionX).toBe(0)
  })

  it('壊れた値は null', () => {
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
  })
})

describe('幾何', () => {
  it('区画の奥行は目標面積÷幅、土地の奥行を超えない', () => {
    expect(sectionDepth(plan({ sectionWidth: 20, targetTsubo: 100 }))).toBeCloseTo(
      tsuboToM2(100) / 20,
    )
    expect(sectionDepth(plan({ landDepth: 10, sectionWidth: 20, targetTsubo: 100 }))).toBe(10)
  })

  it('normalizePlan は区画を土地の中、建物を区画の中に収める', () => {
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

  it('区画が道路に接していれば路地状部分は無い。奥なら左右の辺に付く', () => {
    expect(flagRect(plan())).toBeNull()
    const back = plan({ sectionWidth: 12, sectionX: 4, sectionY: 20, flagWidth: 3 })
    expect(flagRect(back)).toEqual({ x: 4, y: 0, width: 3, depth: 20 })
    expect(flagRect({ ...back, flagSide: 'right' })).toEqual({ x: 13, y: 0, width: 3, depth: 20 })
    expect(flagRect({ ...back, flagWidth: 0 })).toBeNull()
  })

  it('区画・建物の矩形は土地の座標系', () => {
    const p = plan({ sectionX: 0, sectionY: 5, buildingX: 2, buildingY: 3 })
    expect(sectionRect(p)).toMatchObject({ x: 0, y: 5, width: 20 })
    expect(buildingRect(p)).toMatchObject({ x: 2, y: 8, width: 14 })
  })

  it('路地状部分の幅の目安は長さ 20m を境に 2m / 3m', () => {
    expect(requiredFlagWidth(20)).toBe(2)
    expect(requiredFlagWidth(20.1)).toBe(3)
  })
})

describe('方角', () => {
  const base = { sectionWidth: 20, buildingWidth: 10, buildingX: 2, buildingY: 3 }
  it('南側の空きは道路の方角で測る辺が変わる', () => {
    const s = plan({ ...base, roadSide: 'S' })
    expect(southGap(s)).toBe(3)
    const n = plan({ ...base, roadSide: 'N' })
    expect(southGap(n)).toBeCloseTo(sectionDepth(n) - 3 - buildingDepth(n))
    expect(southGap(plan({ ...base, roadSide: 'E' }))).toBe(2)
    expect(southGap(plan({ ...base, roadSide: 'W' }))).toBe(8)
  })

  it('北の向き', () => {
    expect([northAngle('S'), northAngle('N'), northAngle('E'), northAngle('W')]).toEqual([
      0, 180, 90, 270,
    ])
  })

  it('placeBuildingNorth は南側の空きが最大になる辺へ寄せる', () => {
    for (const roadSide of ['S', 'N', 'E', 'W'] as const) {
      const p = placeBuildingNorth(plan({ roadSide, buildingWidth: 10 }))
      const others = [
        p.buildingX,
        p.buildingY,
        p.sectionWidth - p.buildingX - p.buildingWidth,
        sectionDepth(p) - p.buildingY - buildingDepth(p),
      ]
      // 南の反対側（北）の余白が外壁後退と同じ＝北に寄っている
      expect(Math.min(...others)).toBeCloseTo(1, 0)
      expect(southGap(p)).toBeGreaterThan(3.5)
    }
  })
})

describe('evaluateSite', () => {
  it('手前・全幅の区画: 面積と接道は OK、残りの土地が無接道になる', () => {
    const p = plan({ sectionWidth: 20, sectionY: 0 })
    const e = evaluateSite(p)
    expect(m2ToTsubo(e.sectionArea)).toBeCloseTo(100)
    expect(e.flagArea).toBe(0)
    expect(check(p, 'area').status).toBe('ok')
    expect(check(p, 'road').status).toBe('ok')
    expect(check(p, 'remain').status).toBe('ng')
    expect(e.landArea).toBe(1000)
  })

  it('手前・間口より狭い区画なら残りの土地も道路に接したまま', () => {
    expect(check(plan({ sectionWidth: 14 }), 'remain').status).toBe('ok')
  })

  it('奥の区画: 路地状部分の面積が敷地に足され、幅で接道を判定する', () => {
    const p = plan({ sectionWidth: 17, sectionX: 3, sectionY: 25, flagWidth: 3, flagSide: 'left' })
    const e = evaluateSite(p)
    expect(e.flagArea).toBeCloseTo(75)
    expect(e.siteArea).toBeCloseTo(e.sectionArea + 75)
    expect(check(p, 'road').status).toBe('ok')
    expect(check({ ...p, flagWidth: 2.5 }, 'road').status).toBe('ng')
    expect(check(p, 'remain').status).toBe('ok')
  })

  it('奥なのに路地状部分の幅が 0 なら接道 NG', () => {
    const p = plan({ sectionY: 20, flagWidth: 0 })
    expect(check(p, 'road').status).toBe('ng')
  })

  it('間口 2m 未満の区画は接道 NG', () => {
    const p = normalizePlan({
      ...DEFAULT_SITE_PLAN,
      landWidth: 1.5,
      sectionWidth: 1.5,
      buildingWidth: 1,
    })
    expect(check(p, 'road').status).toBe('ng')
  })

  it('奥行が足りなければ面積 warn', () => {
    expect(check(plan({ landDepth: 10 }), 'area').status).toBe('warn')
  })

  it('全部使えば残りの土地は無し', () => {
    const p = plan({ landWidth: 20, landDepth: tsuboToM2(100) / 20 })
    expect(check(p, 'remain').detail).toContain('ありません')
  })

  it('建ぺい率・容積率・外壁後退・南側の空き', () => {
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
    expect(check({ ...p, buildingY: 1 }, 'south').status).toBe('warn')
  })
})

describe('寄せる', () => {
  it('手前・奥', () => {
    expect(moveSectionToFront(plan({ sectionY: 10 })).sectionY).toBe(0)
    const back = moveSectionToBack(plan())
    expect(back.sectionY + sectionDepth(back)).toBeCloseTo(50, 0)
  })
})
