import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SITE_PLAN,
  M2_PER_TSUBO,
  PARKING_M2_PER_CAR,
  accessRect,
  ROAD_SIDE_LABEL,
  buildingDepth,
  buildingRect,
  effectiveFloorAreaRatio,
  evaluateSite,
  fireSafeRect,
  formatLotLines,
  lotsTouched,
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

// 既存の幾何・判定のテストは駐車場への通路を切った状態で見る（通路は下の describe で）
const plan = (overrides: Partial<SitePlan> = {}): SitePlan =>
  normalizePlan({ ...DEFAULT_SITE_PLAN, parkingAccess: false, ...overrides })
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
    expect(parseSitePlan(JSON.stringify({ ...DEFAULT_SITE_PLAN, parkingAccess: 'yes' }))).toBeNull()
    expect(parseSitePlan(JSON.stringify({ ...DEFAULT_SITE_PLAN, accessSide: 'top' }))).toBeNull()
  })

  it('駐車場への通路が無い古い保存値は既定値で補う', () => {
    const { parkingAccess: _p, accessWidth: _w, accessSide: _s, ...old } = DEFAULT_SITE_PLAN
    const parsed = parseSitePlan(JSON.stringify(old))
    expect(parsed?.parkingAccess).toBe(true)
    expect(parsed?.accessWidth).toBe(4)
    expect(parsed?.accessSide).toBe('right')
  })

  it('道路の幅員・準防火・筆界が無い古い保存値も既定値で補い、形が違えば null', () => {
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
      // 南の反対側（北）の余白が境界からの離れと同じ＝北に寄っている
      expect(Math.min(...others)).toBeGreaterThanOrEqual(p.setback)
      expect(Math.min(...others)).toBeLessThan(p.setback + 0.1)
      expect(check(p, 'setback').status).toBe('ok')
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
    // 神奈川県の条例は通路の長さで幅を上乗せしない: 長さ 25m でも法の 2m で足りる（車は入らない）
    expect(check({ ...p, flagWidth: 2.5 }, 'road').status).toBe('warn')
    expect(check({ ...p, flagWidth: 1.5 }, 'road').status).toBe('ng')
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
    expect(check({ ...p, buildingY: 1, roadWidth: 0 }, 'south').status).toBe('warn')
  })

  it('区画の南が道路なら、道路の幅員も南の空きに数える', () => {
    const p = plan({ roadSide: 'S', sectionY: 0, buildingY: 1, roadWidth: 5 })
    expect(check(p, 'south').status).toBe('ok')
    expect(check(p, 'south').detail).toContain('道路 5m')
    // 奥の区画なら道路は数えない
    const back = plan({ roadSide: 'S', sectionY: 20, buildingY: 1, roadWidth: 5 })
    expect(check(back, 'south').status).toBe('warn')
  })

  it('容積率は前面道路の幅員×0.4 と指定の小さい方', () => {
    expect(effectiveFloorAreaRatio(plan({ floorAreaRatio: 200, roadWidth: 4 }))).toBe(160)
    expect(effectiveFloorAreaRatio(plan({ floorAreaRatio: 200, roadWidth: 5 }))).toBe(200)
    expect(effectiveFloorAreaRatio(plan({ floorAreaRatio: 200, roadWidth: 12 }))).toBe(200)
    const narrow = plan({ floorAreaRatio: 200, roadWidth: 4 })
    expect(evaluateSite(narrow).floorAreaLimit).toBe(160)
    expect(check(narrow, 'floorArea').detail).toContain('×0.4')
    expect(check(plan({ roadWidth: 5 }), 'floorArea').detail).not.toContain('×0.4')
  })
})

describe('準防火地域（延焼のおそれのある部分）', () => {
  const fire = (o: Partial<SitePlan> = {}) =>
    plan({ quasiFireZone: true, sectionWidth: 20, roadWidth: 5, ...o })

  it('延焼ラインは隣地から 3m・道路側は道路中心線から 3m', () => {
    const p = fire({ sectionY: 0 })
    expect(fireSafeRect(p)).toEqual({
      x: 3,
      y: 0.5,
      width: 14,
      depth: sectionDepth(p) - 0.5 - 3,
    })
    // 奥の区画は手前も隣地
    expect(fireSafeRect(fire({ sectionY: 10 })).y).toBe(3)
    // 幅員 6m 以上なら道路側は延焼ラインが境界より外
    expect(fireSafeRect(fire({ sectionY: 0, roadWidth: 8 })).y).toBe(0)
    // 狭い区画では内側が無くなる
    expect(fireSafeRect(fire({ sectionWidth: 5 })).width).toBe(0)
  })

  it('建物が延焼ラインにかかる辺を方角で知らせる', () => {
    const p = fire({ buildingWidth: 10, buildingX: 1, buildingY: 3 })
    const c = check(p, 'fire')
    expect(c.status).toBe('warn')
    expect(c.detail).toContain('西')
    expect(c.detail).not.toContain('東')
    // 奥・右にかかる
    const q = fire({ buildingWidth: 14, buildingX: 5, buildingY: 99 })
    expect(check(q, 'fire').detail).toContain('北・東')
    // 手前にかかる（奥の区画）
    const r = fire({ sectionY: 10, buildingWidth: 10, buildingX: 5, buildingY: 1 })
    expect(check(r, 'fire').detail).toContain('南')
  })

  it('延焼ラインの内側に収まれば OK、準防火でなければ判定しない', () => {
    const p = fire({ buildingTsubo: 20, buildingWidth: 10, buildingX: 5, buildingY: 5 })
    expect(check(p, 'fire').status).toBe('ok')
    expect(evaluateSite(plan()).checks.find((c) => c.id === 'fire')).toBeUndefined()
  })

  it('方角の対応', () => {
    expect(sideDirections('S')).toEqual({ front: '南', back: '北', left: '西', right: '東' })
    expect(sideDirections('N').front).toBe('北')
    expect(sideDirections('E').right).toBe('北')
    expect(sideDirections('W').left).toBe('北')
  })
})

describe('筆界', () => {
  it('入力の文字を読み書きする', () => {
    expect(parseLotLines('10.5, 20')).toEqual([10.5, 20])
    expect(parseLotLines('10.5、20 abc')).toEqual([10.5, 20])
    expect(parseLotLines('')).toEqual([])
    expect(formatLotLines([10.5, 20])).toBe('10.5, 20')
  })

  it('土地の内側だけを昇順・重複なしで持つ', () => {
    expect(plan({ lotLines: [15, 10.54, 10.5, 0, 20, -1, 30] }).lotLines).toEqual([10.5, 15])
  })

  it('区画がまたぐ筆を数える', () => {
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

describe('寄せる', () => {
  it('手前・奥', () => {
    expect(moveSectionToFront(plan({ sectionY: 10 })).sectionY).toBe(0)
    const back = moveSectionToBack(plan())
    expect(back.sectionY + sectionDepth(back)).toBeCloseTo(50, 0)
  })
})

describe('駐車場への通路', () => {
  const withAccess = (overrides: Partial<SitePlan> = {}) =>
    normalizePlan({ ...DEFAULT_SITE_PLAN, ...overrides })

  it('手前の区画は通路の帯を避けて幅と位置が詰まり、奥行が伸びる', () => {
    const right = withAccess({ sectionWidth: 20, sectionY: 0, accessSide: 'right', accessWidth: 4 })
    expect(right.sectionWidth).toBe(16)
    expect(right.sectionX).toBe(0)
    expect(sectionDepth(right)).toBeCloseTo(tsuboToM2(100) / 16)
    expect(accessRect(right)).toEqual({ x: 16, y: 0, width: 4, depth: sectionDepth(right) })

    const left = withAccess({ sectionWidth: 20, sectionX: 0, accessSide: 'left', accessWidth: 4 })
    expect(left.sectionX).toBe(4)
    expect(accessRect(left)?.x).toBe(0)
  })

  it('区画が土地の奥まで届くなら通路は無く、区画も詰めない', () => {
    const back = withAccess({ sectionWidth: 20, sectionY: 999 })
    expect(back.sectionWidth).toBe(20)
    expect(accessRect(back)).toBeNull()
    const e = evaluateSite(back)
    expect(e.accessArea).toBe(0)
    const c = e.checks.find((x) => x.id === 'parking')!
    expect(c.status).toBe('ok')
    expect(c.detail).toContain('不要')
  })

  it('通路を切る・幅 0 なら通路は無い', () => {
    expect(accessRect(withAccess({ parkingAccess: false }))).toBeNull()
    expect(accessRect(withAccess({ accessWidth: 0 }))).toBeNull()
    expect(
      evaluateSite(withAccess({ parkingAccess: false })).checks.some((c) => c.id === 'parking'),
    ).toBe(false)
  })

  it('判定: 幅 4m 以上で OK、狭いと注意。面積は残りの土地に含み、台数を概算する', () => {
    const p = withAccess({ accessWidth: 4 })
    const e = evaluateSite(p)
    const c = e.checks.find((x) => x.id === 'parking')!
    expect(c.status).toBe('ok')
    expect(e.accessArea).toBeCloseTo(4 * sectionDepth(p))
    expect(c.detail).toContain(`${Math.floor(e.remainingArea / PARKING_M2_PER_CAR)} 台`)
    expect(check(withAccess({ accessWidth: 3 }), 'parking').status).toBe('warn')
    // 通路があれば残りの土地も道路に接したまま
    expect(check(p, 'remain').status).toBe('ok')
  })

  it('通路の幅は土地の間口より 1m 以上狭く収める', () => {
    expect(withAccess({ accessWidth: 99 }).accessWidth).toBe(19)
  })
})
