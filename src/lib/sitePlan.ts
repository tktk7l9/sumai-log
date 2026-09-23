/**
 * 区画シミュレーター（/site）の純粋関数。
 *
 * 大きな土地（長方形で近似）の一部を自分たちの敷地として切り出し、そこに平屋を置いたときの
 * 面積・接道・建ぺい率などを確かめる。座標はメートルで、原点は「道路側の左端」。
 *   x: 間口方向（左→右）
 *   y: 奥行方向（道路→奥）。区画の y は「道路から区画の手前側の辺までの距離」
 * 画面では道路を下に描く（y が大きいほど上＝奥）。
 *
 * 保存するのは寸法の数値だけで、所在地・地番・座標は持たない（design.md §1。土地の一次情報は
 * アプリの外に置く）。法規の数値（建ぺい率・容積率・外壁後退・路地状部分の幅）はどれも
 * 画面で変えられる「目安」で、実際の値は役所の窓口で確かめる前提。
 */

/** 1 坪 = 400/121 ㎡（約 3.3058） */
export const M2_PER_TSUBO = 400 / 121

export function tsuboToM2(tsubo: number): number {
  return tsubo * M2_PER_TSUBO
}

export function m2ToTsubo(m2: number): number {
  return m2 / M2_PER_TSUBO
}

/** 道路が土地のどちら側にあるか（画面では常に下に描く） */
export const ROAD_SIDES = ['S', 'N', 'E', 'W'] as const
export type RoadSide = (typeof ROAD_SIDES)[number]
export const ROAD_SIDE_LABEL: Record<RoadSide, string> = { S: '南', N: '北', E: '東', W: '西' }

export type SitePlan = {
  version: 1
  /** 土地全体（長方形で近似）の間口・奥行（m） */
  landWidth: number
  landDepth: number
  roadSide: RoadSide
  /** 区画（自分たちの敷地の本体部分）。奥行は targetTsubo と幅から決まる */
  targetTsubo: number
  sectionWidth: number
  sectionX: number
  sectionY: number
  /** 区画が道路に接しないとき、道路から区画までの通路（路地状部分）の幅と、区画のどちらの辺に付けるか */
  flagWidth: number
  flagSide: 'left' | 'right'
  /** 建物（平屋の外形）。奥行は buildingTsubo と幅から決まる。位置は区画の左手前からの距離 */
  buildingTsubo: number
  buildingWidth: number
  buildingX: number
  buildingY: number
  /** 法規の目安 */
  coverageRatio: number
  floorAreaRatio: number
  setback: number
}

export const DEFAULT_SITE_PLAN: SitePlan = {
  version: 1,
  landWidth: 20,
  landDepth: 50,
  roadSide: 'S',
  targetTsubo: 100,
  sectionWidth: 20,
  sectionX: 0,
  sectionY: 0,
  flagWidth: 2.5,
  flagSide: 'left',
  buildingTsubo: 35,
  buildingWidth: 14,
  buildingX: 3,
  buildingY: 3,
  coverageRatio: 50,
  floorAreaRatio: 100,
  setback: 1,
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const NUMBER_KEYS = [
  'landWidth',
  'landDepth',
  'targetTsubo',
  'sectionWidth',
  'sectionX',
  'sectionY',
  'flagWidth',
  'buildingTsubo',
  'buildingWidth',
  'buildingX',
  'buildingY',
  'coverageRatio',
  'floorAreaRatio',
  'setback',
] as const

/** 設定 `sitePlan` の JSON を読む。形が違えば null（画面は既定値で始める） */
export function parseSitePlan(raw: string | null | undefined): SitePlan | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed) || parsed.version !== 1) return null
  for (const key of NUMBER_KEYS) {
    const v = parsed[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
  }
  if (!ROAD_SIDES.includes(parsed.roadSide as RoadSide)) return null
  if (parsed.flagSide !== 'left' && parsed.flagSide !== 'right') return null
  return normalizePlan(parsed as unknown as SitePlan)
}

/** 0.1 m 単位に丸める（ドラッグで出る細かい端数を持たない） */
export function round1(v: number): number {
  return Math.round(v * 10) / 10
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max))
}

/** 区画の奥行（m）。目標面積÷幅。土地の奥行を超えない */
export function sectionDepth(plan: SitePlan): number {
  return Math.min(tsuboToM2(plan.targetTsubo) / plan.sectionWidth, plan.landDepth)
}

/** 建物の奥行（m）。建物面積÷幅 */
export function buildingDepth(plan: SitePlan): number {
  return tsuboToM2(plan.buildingTsubo) / plan.buildingWidth
}

/**
 * 値を土地・区画の中に収める。区画の幅は土地の間口まで、区画は土地の中、建物は区画の中
 * （外壁後退は「収める」対象にせず、判定で知らせる）。路地状部分の幅は区画の幅まで。
 */
export function normalizePlan(plan: SitePlan): SitePlan {
  const landWidth = Math.max(plan.landWidth, 1)
  const landDepth = Math.max(plan.landDepth, 1)
  const sectionWidth = clamp(plan.sectionWidth, 1, landWidth)
  const next: SitePlan = { ...plan, landWidth, landDepth, sectionWidth }
  const sDepth = sectionDepth(next)
  next.sectionX = round1(clamp(plan.sectionX, 0, landWidth - sectionWidth))
  next.sectionY = round1(clamp(plan.sectionY, 0, landDepth - sDepth))
  next.flagWidth = clamp(plan.flagWidth, 0, sectionWidth)
  next.buildingWidth = clamp(plan.buildingWidth, 1, sectionWidth)
  const bDepth = buildingDepth(next)
  next.buildingX = round1(clamp(plan.buildingX, 0, sectionWidth - next.buildingWidth))
  next.buildingY = round1(clamp(plan.buildingY, 0, sDepth - bDepth))
  return next
}

export type Rect = { x: number; y: number; width: number; depth: number }

export function sectionRect(plan: SitePlan): Rect {
  return { x: plan.sectionX, y: plan.sectionY, width: plan.sectionWidth, depth: sectionDepth(plan) }
}

/** 路地状部分（道路→区画の通路）。区画が道路に接していれば null */
export function flagRect(plan: SitePlan): Rect | null {
  if (plan.sectionY <= 0 || plan.flagWidth <= 0) return null
  const x =
    plan.flagSide === 'left' ? plan.sectionX : plan.sectionX + plan.sectionWidth - plan.flagWidth
  return { x, y: 0, width: plan.flagWidth, depth: plan.sectionY }
}

/** 建物の外形（土地の座標系） */
export function buildingRect(plan: SitePlan): Rect {
  return {
    x: plan.sectionX + plan.buildingX,
    y: plan.sectionY + plan.buildingY,
    width: plan.buildingWidth,
    depth: buildingDepth(plan),
  }
}

/**
 * 路地状部分に必要な幅の目安（m）。神奈川県建築基準条例の考え方（路地状部分の長さ 20m 以下は
 * 2m、超えると 3m）に合わせた目安。市の条例・運用で変わりうるので、画面では「要確認」と添える。
 */
export function requiredFlagWidth(length: number): number {
  return length > 20 ? 3 : 2
}

/** 区画内で、建物の南側に取れる空き（m）。道路の方角で「南」が画面のどちらかが変わる */
export function southGap(plan: SitePlan): number {
  const sDepth = sectionDepth(plan)
  const bDepth = buildingDepth(plan)
  switch (plan.roadSide) {
    case 'S':
      return plan.buildingY
    case 'N':
      return sDepth - (plan.buildingY + bDepth)
    case 'E':
      return plan.buildingX
    case 'W':
      return plan.sectionWidth - (plan.buildingX + plan.buildingWidth)
  }
}

/** 画面上の北の向き（度。0 = 上、時計回り）。道路を下に描くための回転 */
export function northAngle(roadSide: RoadSide): number {
  return { S: 0, N: 180, E: 90, W: 270 }[roadSide]
}

export type CheckStatus = 'ok' | 'warn' | 'ng'
export type SiteCheck = { id: string; status: CheckStatus; label: string; detail: string }

export type SiteEvaluation = {
  sectionArea: number
  flagArea: number
  siteArea: number
  landArea: number
  remainingArea: number
  buildingArea: number
  coverageUsed: number
  floorAreaUsed: number
  southGap: number
  checks: SiteCheck[]
}

function fmt(v: number, digits = 1): string {
  return v.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

/** 面積・率を出し、確かめたい点を ok / warn / ng で並べる */
export function evaluateSite(plan: SitePlan): SiteEvaluation {
  const section = sectionRect(plan)
  const flag = flagRect(plan)
  const sectionArea = section.width * section.depth
  const flagArea = flag ? flag.width * flag.depth : 0
  const siteArea = sectionArea + flagArea
  const landArea = plan.landWidth * plan.landDepth
  const remainingArea = landArea - siteArea
  const buildingArea = tsuboToM2(plan.buildingTsubo)
  const coverageUsed = (buildingArea / siteArea) * 100
  // 平屋なので延床＝建築面積として見る
  const floorAreaUsed = coverageUsed
  const gap = southGap(plan)
  const checks: SiteCheck[] = []

  // 1. 目標の面積が取れているか（土地の奥行が足りないと区画が縮む）
  const targetArea = tsuboToM2(plan.targetTsubo)
  checks.push(
    sectionArea + 0.01 >= targetArea
      ? {
          id: 'area',
          status: 'ok',
          label: '区画の面積',
          detail: `${fmt(m2ToTsubo(sectionArea))}坪（${fmt(sectionArea)}㎡）を確保`,
        }
      : {
          id: 'area',
          status: 'warn',
          label: '区画の面積',
          detail: `土地の奥行が足りず ${fmt(m2ToTsubo(sectionArea))}坪しか取れない。区画の幅を広げる`,
        },
  )

  // 2. 接道（建築基準法: 敷地が道路に 2m 以上接する）
  if (!flag) {
    if (plan.sectionY > 0) {
      checks.push({
        id: 'road',
        status: 'ng',
        label: '接道',
        detail: '区画が道路に接していません。路地状部分の幅を入れてください',
      })
    } else {
      checks.push({
        id: 'road',
        status: plan.sectionWidth >= 2 ? 'ok' : 'ng',
        label: '接道',
        detail: `道路に ${fmt(plan.sectionWidth)}m 接する（2m 以上が必要）`,
      })
    }
  } else {
    const need = requiredFlagWidth(flag.depth)
    checks.push({
      id: 'road',
      status: flag.width >= need ? 'ok' : 'ng',
      label: '接道（路地状部分）',
      detail: `通路の長さ ${fmt(flag.depth)}m・幅 ${fmt(flag.width)}m。幅 ${need}m 以上が目安（県条例の考え方。市に要確認）`,
    })
  }

  // 3. 残りの土地が道路に接し続けるか（手前を全部使うと奥の土地が無接道になる）
  const usedFrontage = plan.sectionY <= 0 ? plan.sectionWidth : flag ? flag.width : 0
  const remainingFrontage = plan.landWidth - usedFrontage
  checks.push(
    remainingArea <= 0.01
      ? { id: 'remain', status: 'ok', label: '残りの土地', detail: '残りの土地はありません' }
      : remainingFrontage >= 2
        ? {
            id: 'remain',
            status: 'ok',
            label: '残りの土地',
            detail: `${fmt(m2ToTsubo(remainingArea))}坪。道路に ${fmt(remainingFrontage)}m 接したまま`,
          }
        : {
            id: 'remain',
            status: 'ng',
            label: '残りの土地',
            detail: `${fmt(m2ToTsubo(remainingArea))}坪が道路に接しなくなる（接する幅 ${fmt(Math.max(remainingFrontage, 0))}m）。区画の幅を間口より狭くする`,
          },
  )

  // 4. 建ぺい率・容積率
  checks.push({
    id: 'coverage',
    status: coverageUsed <= plan.coverageRatio ? 'ok' : 'ng',
    label: '建ぺい率',
    detail: `${fmt(coverageUsed)}%（上限 ${plan.coverageRatio}%）`,
  })
  checks.push({
    id: 'floorArea',
    status: floorAreaUsed <= plan.floorAreaRatio ? 'ok' : 'ng',
    label: '容積率',
    detail: `${fmt(floorAreaUsed)}%（上限 ${plan.floorAreaRatio}%）`,
  })

  // 5. 外壁後退（建物と区画の境界の距離）
  const bDepth = buildingDepth(plan)
  const minEdge = Math.min(
    plan.buildingX,
    plan.buildingY,
    plan.sectionWidth - (plan.buildingX + plan.buildingWidth),
    section.depth - (plan.buildingY + bDepth),
  )
  checks.push({
    id: 'setback',
    status: minEdge + 0.01 >= plan.setback ? 'ok' : 'warn',
    label: '外壁後退',
    detail: `境界までの最小距離 ${fmt(minEdge)}m（目安 ${fmt(plan.setback)}m 以上）`,
  })

  // 6. 南側の空き（平屋の日当たりの目安）
  checks.push({
    id: 'south',
    status: gap >= 4 ? 'ok' : 'warn',
    label: '南側の空き',
    detail: `建物の南に ${fmt(gap)}m（区画内）。平屋は 4m 以上あると冬も日が入りやすい`,
  })

  return {
    sectionArea,
    flagArea,
    siteArea,
    landArea,
    remainingArea,
    buildingArea,
    coverageUsed,
    floorAreaUsed,
    southGap: gap,
    checks,
  }
}

/** 区画を道路側（手前）に寄せる */
export function moveSectionToFront(plan: SitePlan): SitePlan {
  return normalizePlan({ ...plan, sectionY: 0 })
}

/** 区画を奥（道路の反対側）に寄せる */
export function moveSectionToBack(plan: SitePlan): SitePlan {
  return normalizePlan({ ...plan, sectionY: plan.landDepth })
}

/**
 * 建物を「南側の空きが最大」になる位置に置く（区画内で南と反対側に寄せ、外壁後退ぶんだけ離す）。
 * 左右（南北と直交する方向）は区画の中央。
 */
export function placeBuildingNorth(plan: SitePlan): SitePlan {
  const sDepth = sectionDepth(plan)
  const bDepth = buildingDepth(plan)
  const centerX = (plan.sectionWidth - plan.buildingWidth) / 2
  const centerY = (sDepth - bDepth) / 2
  const farX = plan.sectionWidth - plan.buildingWidth - plan.setback
  const farY = sDepth - bDepth - plan.setback
  const pos = {
    S: { x: centerX, y: farY },
    N: { x: centerX, y: plan.setback },
    E: { x: farX, y: centerY },
    W: { x: plan.setback, y: centerY },
  }[plan.roadSide]
  return normalizePlan({ ...plan, buildingX: pos.x, buildingY: pos.y })
}
