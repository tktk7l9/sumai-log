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
 * アプリの外に置く）。法規の数値（建ぺい率・容積率・境界からの離れ・道路の幅員）はどれも
 * 画面で変えられる「目安」で、実際の値は役所の窓口で確かめる前提。
 *
 * 判定が前提にしている法令（神奈川県の県所管区域の住宅＝平屋・延べ 1,000㎡ 以下）:
 *   - 接道: 建築基準法 43 条の 2m。神奈川県建築基準条例には、東京都安全条例のような
 *     「路地状部分の長さに応じて幅を広げる」規定は無い（延べ 1,000㎡ 超の 6m は住宅では効かない）
 *   - 容積率: 前面道路の幅員が 12m 未満なら 幅員×0.4（住居系）と指定容積率の小さい方（法 52 条 2 項）
 *   - 準防火地域: 隣地境界線から 3m・道路中心線から 3m 以内（1 階）が延焼のおそれのある部分
 *     （法 2 条 6 号）。そこにかかる外壁の開口部は防火設備にする（法 61 条）
 *   - 境界からの離れ: 外壁の後退距離の指定が無い地域では、民法 234 条の 50cm が目安
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
  /**
   * 残りの土地（月極駐車場など）へ道路から入るための通路。区画の奥に土地が残るとき、
   * 土地の左右どちらかの端に道路から奥まで幅 accessWidth の帯を空け、区画はそこに
   * かからないようにする（道路に面する辺が 1 つしかない土地で、手前に区画を取っても
   * 奥を使い続けるため）。通路は残りの土地の一部（自分たちの敷地ではない）
   */
  parkingAccess: boolean
  accessWidth: number
  accessSide: 'left' | 'right'
  /** 建物（平屋の外形）。奥行は buildingTsubo と幅から決まる。位置は区画の左手前からの距離 */
  buildingTsubo: number
  buildingWidth: number
  buildingX: number
  buildingY: number
  /** 法規の目安 */
  coverageRatio: number
  floorAreaRatio: number
  /** 建物と区画の境界の距離の目安（外壁後退の指定が無ければ民法 234 条の 0.5m） */
  setback: number
  /** 前面道路の幅員（m）。容積率の道路幅員制限・道路中心線からの延焼ライン・南の空きに使う */
  roadWidth: number
  /** 準防火地域か（延焼のおそれのある部分を図と判定に出す） */
  quasiFireZone: boolean
  /** 土地の中の筆界（左端からの距離 m）。2 筆以上を 1 つの土地として扱うとき */
  lotLines: number[]
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
  parkingAccess: true,
  accessWidth: 4,
  accessSide: 'right',
  buildingTsubo: 35,
  buildingWidth: 14,
  buildingX: 3,
  buildingY: 3,
  coverageRatio: 60,
  floorAreaRatio: 200,
  setback: 0.5,
  roadWidth: 4,
  quasiFireZone: false,
  lotLines: [],
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
  'accessWidth',
  'buildingTsubo',
  'buildingWidth',
  'buildingX',
  'buildingY',
  'coverageRatio',
  'floorAreaRatio',
  'setback',
  'roadWidth',
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
  // 駐車場への通路（parkingAccess 以下）と道路の幅員・準防火・筆界は後から足した項目。
  // 保存済みの古い値に無ければ既定値で補う
  const data: Record<string, unknown> = {
    parkingAccess: DEFAULT_SITE_PLAN.parkingAccess,
    accessWidth: DEFAULT_SITE_PLAN.accessWidth,
    accessSide: DEFAULT_SITE_PLAN.accessSide,
    roadWidth: DEFAULT_SITE_PLAN.roadWidth,
    quasiFireZone: DEFAULT_SITE_PLAN.quasiFireZone,
    lotLines: DEFAULT_SITE_PLAN.lotLines,
    ...parsed,
  }
  for (const key of NUMBER_KEYS) {
    const v = data[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
  }
  if (!ROAD_SIDES.includes(data.roadSide as RoadSide)) return null
  if (data.flagSide !== 'left' && data.flagSide !== 'right') return null
  if (typeof data.parkingAccess !== 'boolean') return null
  if (data.accessSide !== 'left' && data.accessSide !== 'right') return null
  if (typeof data.quasiFireZone !== 'boolean') return null
  const lines = data.lotLines
  if (!Array.isArray(lines) || !lines.every((v) => Number.isFinite(v))) {
    return null
  }
  return normalizePlan(data as unknown as SitePlan)
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
 *
 * 駐車場への通路（parkingAccess）が有効で区画の奥に土地が残るときは、土地の端の通路の帯を
 * 避けるよう区画の幅と左右の位置を詰める。幅を詰めると奥行が伸びるので、奥行を求め直して
 * から道路からの距離を収め直す（詰めた幅はそのまま残し、勝手に広げ直さない）。
 */
export function normalizePlan(plan: SitePlan): SitePlan {
  const landWidth = Math.max(plan.landWidth, 1)
  const landDepth = Math.max(plan.landDepth, 1)
  const accessWidth = clamp(plan.accessWidth, 0, landWidth - 1)
  let sectionWidth = clamp(plan.sectionWidth, 1, landWidth)
  const roadWidth = clamp(plan.roadWidth, 0, 50)
  // 筆界は土地の内側だけを、左から順に重複なく持つ
  const lotLines = [...new Set(plan.lotLines.map(round1))]
    .filter((v) => v > 0 && v < landWidth)
    .sort((a, b) => a - b)
  const next: SitePlan = {
    ...plan,
    landWidth,
    landDepth,
    accessWidth,
    sectionWidth,
    roadWidth,
    lotLines,
  }
  let sDepth = sectionDepth(next)
  let sectionY = clamp(plan.sectionY, 0, landDepth - sDepth)
  const leavesBack = landDepth - sectionY - sDepth > 0.01
  const lane = plan.parkingAccess && accessWidth > 0 && leavesBack
  if (lane) {
    sectionWidth = clamp(sectionWidth, 1, landWidth - accessWidth)
    next.sectionWidth = sectionWidth
    sDepth = sectionDepth(next)
    sectionY = clamp(sectionY, 0, landDepth - sDepth)
  }
  const minX = lane && plan.accessSide === 'left' ? accessWidth : 0
  const maxX = lane && plan.accessSide === 'right' ? landWidth - accessWidth : landWidth
  next.sectionX = round1(clamp(plan.sectionX, minX, maxX - sectionWidth))
  next.sectionY = round1(sectionY)
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

/**
 * 残りの土地（駐車場）への通路。道路から区画の奥の端まで、土地の左右どちらかの端に取る。
 * 通路が無効、または区画の奥に土地が残らない（区画が土地の奥まで届く）なら null
 */
export function accessRect(plan: SitePlan): Rect | null {
  if (!plan.parkingAccess || plan.accessWidth <= 0) return null
  const reach = plan.sectionY + sectionDepth(plan)
  if (plan.landDepth - reach <= 0.01) return null
  const x = plan.accessSide === 'left' ? 0 : plan.landWidth - plan.accessWidth
  return { x, y: 0, width: plan.accessWidth, depth: reach }
}

/** 駐車台数の概算に使う 1 台あたりの面積（㎡。区画 2.5×5m に通路の取り分を足した目安） */
export const PARKING_M2_PER_CAR = 30

/** 建物の外形（土地の座標系） */
export function buildingRect(plan: SitePlan): Rect {
  return {
    x: plan.sectionX + plan.buildingX,
    y: plan.sectionY + plan.buildingY,
    width: plan.buildingWidth,
    depth: buildingDepth(plan),
  }
}

/** 敷地が道路に接する長さの下限（m）。建築基準法 43 条 */
export const MIN_FRONTAGE = 2

/** 車 1 台が通れる通路の幅の目安（m）。法の下限（2m）では車が入らない */
export const CAR_LANE_WIDTH = 3

/** 延焼のおそれのある部分の距離（m、1 階）。隣地境界線・道路中心線から（建築基準法 2 条 6 号） */
export const FIRE_SPREAD_DISTANCE = 3

/**
 * 前面道路の幅員による容積率の上限（%）。幅員 12m 未満なら 幅員×0.4（住居系の用途地域）で、
 * 指定容積率との小さい方が効く（建築基準法 52 条 2 項）
 */
export function effectiveFloorAreaRatio(plan: SitePlan): number {
  if (plan.roadWidth >= 12) return plan.floorAreaRatio
  return Math.min(plan.floorAreaRatio, Math.round(plan.roadWidth * 40))
}

/** 区画の手前・奥・左・右が、それぞれどの方角か（道路の方角から決まる。画面の北の向きと揃える） */
export function sideDirections(roadSide: RoadSide): {
  front: string
  back: string
  left: string
  right: string
} {
  return {
    S: { front: '南', back: '北', left: '西', right: '東' },
    N: { front: '北', back: '南', left: '東', right: '西' },
    E: { front: '東', back: '西', left: '南', right: '北' },
    W: { front: '西', back: '東', left: '北', right: '南' },
  }[roadSide]
}

/**
 * 延焼ライン（区画の座標、区画の左手前が原点）。この長方形の外側が延焼のおそれのある部分。
 * 区画が道路に接していれば手前は道路中心線から 3m（＝境界から 3m−幅員/2）、接していなければ
 * 手前も隣地境界線として 3m。左右・奥は隣地（残りの土地も分けたあとは別の敷地）として 3m
 */
export function fireSafeRect(plan: SitePlan): Rect {
  const sDepth = sectionDepth(plan)
  const front =
    plan.sectionY <= 0
      ? Math.max(FIRE_SPREAD_DISTANCE - plan.roadWidth / 2, 0)
      : FIRE_SPREAD_DISTANCE
  return {
    x: FIRE_SPREAD_DISTANCE,
    y: front,
    width: Math.max(plan.sectionWidth - FIRE_SPREAD_DISTANCE * 2, 0),
    depth: Math.max(sDepth - front - FIRE_SPREAD_DISTANCE, 0),
  }
}

/** 筆界の入力（「10.5, 20」「10.5、20」など）を数値の並びに。読めない片は捨てる */
export function parseLotLines(text: string): number[] {
  return text
    .split(/[,、，\s]+/)
    .filter((t) => t !== '')
    .map(Number)
    .filter((v) => Number.isFinite(v))
}

export function formatLotLines(lines: number[]): string {
  return lines.join(', ')
}

/**
 * 区画がどの筆にかかるか。筆は左から 0 始まりの番号。筆界は道路から奥へまっすぐ通る前提で、
 * 路地状部分は区画の幅の中にあるので区画の左右の範囲だけを見ればよい
 */
export function lotsTouched(plan: SitePlan): number[] {
  const edges = [0, ...plan.lotLines, plan.landWidth]
  const [l, r] = [plan.sectionX, plan.sectionX + plan.sectionWidth]
  const touched: number[] = []
  for (let i = 0; i < edges.length - 1; i++) {
    if (Math.min(r, edges[i + 1]!) - Math.max(l, edges[i]!) > 0.01) touched.push(i)
  }
  return touched
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
  /** 前面道路の幅員を効かせた容積率の上限（%） */
  floorAreaLimit: number
  /** 駐車場への通路の面積（残りの土地に含む）。通路が無ければ 0 */
  accessArea: number
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
    const base = `通路の長さ ${fmt(flag.depth)}m・幅 ${fmt(flag.width)}m。`
    checks.push(
      flag.width < MIN_FRONTAGE
        ? {
            id: 'road',
            status: 'ng',
            label: '接道（路地状部分）',
            detail: `${base}道路に ${MIN_FRONTAGE}m 以上接する必要がある（建築基準法 43 条）`,
          }
        : flag.width < CAR_LANE_WIDTH
          ? {
              id: 'road',
              status: 'warn',
              label: '接道（路地状部分）',
              detail: `${base}法の ${MIN_FRONTAGE}m は満たすが、車で出入りするなら ${CAR_LANE_WIDTH}m 程度は欲しい`,
            }
          : {
              id: 'road',
              status: 'ok',
              label: '接道（路地状部分）',
              detail: `${base}法の ${MIN_FRONTAGE}m 以上（神奈川県の条例に通路の長さによる上乗せは無い）`,
            },
    )
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

  // 3b. 残りの土地（駐車場）への通路
  const access = accessRect(plan)
  const accessArea = access ? access.width * access.depth : 0
  if (plan.parkingAccess) {
    const cars = Math.floor(Math.max(remainingArea, 0) / PARKING_M2_PER_CAR)
    const capacity = `残りの土地で駐車 ${cars} 台前後（1 台あたり通路込み ${PARKING_M2_PER_CAR}㎡ の概算）`
    checks.push(
      access
        ? {
            id: 'parking',
            status: access.width >= 4 ? 'ok' : 'warn',
            label: '駐車場への通路',
            detail: `幅 ${fmt(access.width)}m・長さ ${fmt(access.depth)}m（${fmt(m2ToTsubo(accessArea))}坪、残りの土地に含む）。車 1 台なら 3m、すれ違うなら 5m 程度が目安。${capacity}`,
          }
        : {
            id: 'parking',
            status: 'ok',
            label: '駐車場への通路',
            detail: `区画の奥に土地が残らないので通路は不要（駐車場は道路側の残りの土地）。${capacity}`,
          },
    )
  }

  // 4. 建ぺい率・容積率
  checks.push({
    id: 'coverage',
    status: coverageUsed <= plan.coverageRatio ? 'ok' : 'ng',
    label: '建ぺい率',
    detail: `${fmt(coverageUsed)}%（上限 ${plan.coverageRatio}%）`,
  })
  const floorAreaLimit = effectiveFloorAreaRatio(plan)
  checks.push({
    id: 'floorArea',
    status: floorAreaUsed <= floorAreaLimit ? 'ok' : 'ng',
    label: '容積率',
    detail:
      floorAreaLimit < plan.floorAreaRatio
        ? `${fmt(floorAreaUsed)}%（上限 ${floorAreaLimit}%＝道路の幅員 ${fmt(plan.roadWidth)}m×0.4。指定は ${plan.floorAreaRatio}%）`
        : `${fmt(floorAreaUsed)}%（上限 ${floorAreaLimit}%）`,
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
    label: '境界からの離れ',
    detail: `境界までの最小距離 ${fmt(minEdge)}m（目安 ${fmt(plan.setback)}m 以上）`,
  })

  // 5b. 準防火地域: 延焼のおそれのある部分にかかる外壁
  if (plan.quasiFireZone) {
    const safe = fireSafeRect(plan)
    const dir = sideDirections(plan.roadSide)
    const hit = [
      plan.buildingY + 0.01 < safe.y ? dir.front : null,
      plan.buildingY + bDepth > safe.y + safe.depth + 0.01 ? dir.back : null,
      plan.buildingX + 0.01 < safe.x ? dir.left : null,
      plan.buildingX + plan.buildingWidth > safe.x + safe.width + 0.01 ? dir.right : null,
    ].filter((v): v is string => v !== null)
    checks.push(
      hit.length > 0
        ? {
            id: 'fire',
            status: 'warn',
            label: '延焼のおそれのある部分（準防火地域）',
            detail: `${hit.join('・')}側の外壁が隣地境界線・道路中心線から ${FIRE_SPREAD_DISTANCE}m 以内にかかる。その範囲の窓・玄関ドアは防火設備（網入り・防火サッシ）になる。外壁・軒裏の防火構造はどこでも要る`,
          }
        : {
            id: 'fire',
            status: 'ok',
            label: '延焼のおそれのある部分（準防火地域）',
            detail: `建物は延焼ラインの内側で、窓を防火設備にしなくてよい。外壁・軒裏の防火構造は要る`,
          },
    )
  }

  // 5c. 筆界（2 筆以上の土地から区画を取るとき）
  if (plan.lotLines.length > 0) {
    const lots = lotsTouched(plan)
    const names = lots.map((i) => `左から ${i + 1} 筆目`).join('・')
    checks.push(
      lots.length > 1
        ? {
            id: 'lots',
            status: 'warn',
            label: '筆界',
            detail: `区画が ${lots.length} 筆（${names}）にまたがる。分筆して敷地にするなら、それぞれの筆から切り出して合筆する手間が増える`,
          }
        : {
            id: 'lots',
            status: 'ok',
            label: '筆界',
            detail: `区画は ${names}の中に収まる。分筆はその 1 筆だけで済む`,
          },
    )
  }

  // 6. 南側の空き（平屋の日当たりの目安）。区画の南が道路なら、道路の幅員も空きとして数える
  const southIsRoad = plan.roadSide === 'S' && plan.sectionY <= 0
  const openSouth = southIsRoad ? gap + plan.roadWidth : gap
  checks.push({
    id: 'south',
    status: openSouth >= 4 ? 'ok' : 'warn',
    label: '南側の空き',
    detail: southIsRoad
      ? `建物の南に ${fmt(gap)}m（区画内）＋道路 ${fmt(plan.roadWidth)}m＝${fmt(openSouth)}m。平屋は 4m 以上あると冬も日が入りやすい（道路の向こうの建物は別に確かめる）`
      : `建物の南に ${fmt(gap)}m（区画内）。平屋は 4m 以上あると冬も日が入りやすい`,
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
    floorAreaLimit,
    accessArea,
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
  // 奥側の位置は 0.1m 単位へ切り捨てる（四捨五入だと境界からの離れを割り込むことがある）
  const floor1 = (v: number) => Math.floor(v * 10 + 1e-9) / 10
  const farX = floor1(plan.sectionWidth - plan.buildingWidth - plan.setback)
  const farY = floor1(sDepth - bDepth - plan.setback)
  const pos = {
    S: { x: centerX, y: farY },
    N: { x: centerX, y: plan.setback },
    E: { x: farX, y: centerY },
    W: { x: plan.setback, y: centerY },
  }[plan.roadSide]
  return normalizePlan({ ...plan, buildingX: pos.x, buildingY: pos.y })
}
