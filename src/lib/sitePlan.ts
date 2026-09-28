/**
 * Pure functions for the site plan simulator (/site).
 *
 * Cuts out part of a large piece of land (approximated as a rectangle) as our own site, and
 * checks the area, road frontage (接道), building coverage ratio (建ぺい率) and so on when
 * a single-story house is placed there. Coordinates are in meters, and the origin is "the
 * left end on the road side".
 *   x: along the frontage (left -> right)
 *   y: along the depth (road -> rear). The y of the section is "the distance from the road
 *      to the near edge of the section"
 * On screen the road is drawn at the bottom (a larger y is higher up = further to the rear).
 *
 * Only the dimension numbers are saved, and no location, lot number or coordinates are held
 * (design.md §1. Primary information about the land is kept outside the app). The legal
 * numbers (building coverage ratio, floor area ratio (容積率), setback from the boundary
 * (境界からの離れ), road width (幅員)) are all "rough guides" that can be changed on screen,
 * and the actual values are assumed to be confirmed at the counter of the local government
 * office.
 *
 * Laws that the checks assume (a house in the area of Kanagawa Prefecture administered by
 * the prefecture itself (県所管区域) = single-story, total floor area 1,000㎡ or less):
 *   - Road frontage: the 2m of article 43 of the Building Standards Act (建築基準法). The
 *     Kanagawa Prefecture Building Standards Ordinance (神奈川県建築基準条例) has no rule
 *     like the one in the Tokyo safety ordinance (東京都安全条例) that "widens the width
 *     according to the length of the flag-lot access strip (路地状部分)" (the 6m for a total
 *     floor area over 1,000㎡ does not apply to a house)
 *   - Floor area ratio: when the width of the front road is less than 12m, the smaller of
 *     width x 0.4 (residential zones) and the designated floor area ratio (指定容積率)
 *     (article 52 paragraph 2 of the Act)
 *   - Quasi-fire-prevention district (準防火地域): within 3m of the adjacent land boundary
 *     line and within 3m of the road center line (1st floor) is the part at risk of fire
 *     spread (延焼のおそれのある部分) (article 2 item 6 of the Act). Openings in exterior
 *     walls that fall in it must be fire-protection equipment (防火設備) (article 61 of the
 *     Act)
 *   - Setback from the boundary: in areas with no designated exterior wall setback distance
 *     (外壁の後退距離), the 50cm of article 234 of the Civil Code (民法) is the rough guide
 */

import { FLOORS_LABEL, type BuildPlan } from './research'
import {
  SEASON_DECLINATION,
  rayHitsBox,
  solarPosition,
  sunInLand,
  type Box,
  type Season,
} from './sun'

/** 1 tsubo = 400/121 ㎡ (about 3.3058) */
export const M2_PER_TSUBO = 400 / 121

export function tsuboToM2(tsubo: number): number {
  return tsubo * M2_PER_TSUBO
}

export function m2ToTsubo(m2: number): number {
  return m2 / M2_PER_TSUBO
}

/** Which side of the land the road is on (on screen it is always drawn at the bottom) */
export const ROAD_SIDES = ['S', 'N', 'E', 'W'] as const
export type RoadSide = (typeof ROAD_SIDES)[number]
export const ROAD_SIDE_LABEL: Record<RoadSide, string> = { S: '南', N: '北', E: '東', W: '西' }

/**
 * Adjacent land and surrounding buildings (rectangles in land coordinates. Placed outside
 * the land). building has a height and casts a shadow in the sunlight calculation (height 0
 * means "unknown", and it is drawn in the figure but left out of the calculation). open is
 * land without a building such as a parking lot, a schoolyard or a field, and construction
 * is under construction (the height is the expected one after it is built)
 */
export const NEIGHBOR_KINDS = ['building', 'construction', 'open'] as const
export type NeighborKind = (typeof NEIGHBOR_KINDS)[number]
export const NEIGHBOR_KIND_LABEL: Record<NeighborKind, string> = {
  building: '建物',
  construction: '建設中',
  open: '空地・駐車場など',
}
export type Neighbor = {
  label: string
  kind: NeighborKind
  x: number
  y: number
  width: number
  depth: number
  /** Height (m). 0 means unknown */
  height: number
}
export const NEIGHBOR_LABEL_MAX = 40
export const NEIGHBORS_MAX = 20

export const FLOORS = [1, 2] as const satisfies readonly BuildPlan['floors'][]
export type Floors = BuildPlan['floors']
/** Rough building height per number of floors (m). The initial value when switching */
export const DEFAULT_BUILDING_HEIGHT: Record<Floors, number> = { 1: 4.5, 2: 7.5 }

export type SitePlan = {
  version: 1
  /** Frontage and depth (m) of the whole land (approximated as a rectangle) */
  landWidth: number
  landDepth: number
  roadSide: RoadSide
  /** The section (the main part of our own site). The depth follows from targetTsubo and
   * the width */
  targetTsubo: number
  sectionWidth: number
  sectionX: number
  sectionY: number
  /** When the section does not touch the road, the width of the passage from the road to
   * the section (the flag-lot access strip), and which edge of the section it attaches to */
  flagWidth: number
  flagSide: 'left' | 'right'
  /**
   * The passage for entering the remaining land (a monthly parking lot and so on) from the
   * road. When land remains behind the section, a strip of width accessWidth is left open
   * at the left or right end of the land from the road to the rear, and the section is kept
   * from overlapping it (so that, on land with only 1 edge facing the road, the rear can
   * keep being used even when the section is taken at the front). The passage is part of
   * the remaining land (not our own site)
   */
  parkingAccess: boolean
  accessWidth: number
  accessSide: 'left' | 'right'
  /** Number of floors of the building (1 = single-story, 2 = two-story. A two-story house is
   * viewed as a full two-story where the 1st and 2nd floors have the same area) */
  floors: Floors
  /**
   * The building. buildingTsubo is the total floor area in tsubo, and the footprint
   * (building area) is total floor area / number of floors. The depth follows from the
   * footprint and the width. The position is the distance from the near left corner of the
   * section
   */
  buildingTsubo: number
  buildingWidth: number
  buildingX: number
  buildingY: number
  /** Rough guides for the legal limits */
  coverageRatio: number
  floorAreaRatio: number
  /** Rough guide for the distance between the building and the section boundary (the 0.5m
   * of article 234 of the Civil Code when no exterior wall setback (外壁後退) is designated) */
  setback: number
  /** Width of the front road (m). Used for the road-width limit on the floor area ratio, the
   * fire-spread line (延焼ライン) from the road center line, and the open space to the south */
  roadWidth: number
  /** Whether it is a quasi-fire-prevention district (shows the part at risk of fire spread
   * in the figure and in the checks) */
  quasiFireZone: boolean
  /** Parcel boundaries (筆界) inside the land (distance from the left end, m). For when 2 or
   * more parcels are treated as 1 piece of land */
  lotLines: number[]
  /**
   * The deviation of the actual direction of the road side from the compass direction
   * (roadSide) (degrees, clockwise is +). On land in a block laid out at an angle, for
   * example, when the road side is rotated 10° toward the east from due south it is -10
   * (south 180° -> 170°)
   */
  facingOffset: number
  /** Latitude (degrees). Used for the sunlight calculation */
  latitude: number
  /** Height of our own single-story house (m, for drawing the shadow) */
  buildingHeight: number
  /** Adjacent land and surrounding buildings */
  neighbors: Neighbor[]
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
  floors: 1,
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
  facingOffset: 0,
  latitude: 35.5,
  buildingHeight: 4.5,
  neighbors: [],
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
  'facingOffset',
  'latitude',
  'buildingHeight',
] as const

function isNeighbor(v: unknown): v is Neighbor {
  if (!isRecord(v)) return false
  if (typeof v.label !== 'string' || !NEIGHBOR_KINDS.includes(v.kind as NeighborKind)) return false
  return (['x', 'y', 'width', 'depth', 'height'] as const).every((k) => Number.isFinite(v[k]))
}

/** Reads the JSON of the setting `sitePlan`. null when the shape is wrong (the screen starts
 * with the defaults) */
export function parseSitePlan(raw: string | null | undefined): SitePlan | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed) || parsed.version !== 1) return null
  // The passage to the parking lot (parkingAccess and below), the road width, the
  // quasi-fire-prevention flag and the parcel boundaries are items added later.
  // When an old saved value lacks them, fill them in with the defaults
  const data: Record<string, unknown> = {
    parkingAccess: DEFAULT_SITE_PLAN.parkingAccess,
    accessWidth: DEFAULT_SITE_PLAN.accessWidth,
    accessSide: DEFAULT_SITE_PLAN.accessSide,
    roadWidth: DEFAULT_SITE_PLAN.roadWidth,
    quasiFireZone: DEFAULT_SITE_PLAN.quasiFireZone,
    lotLines: DEFAULT_SITE_PLAN.lotLines,
    facingOffset: DEFAULT_SITE_PLAN.facingOffset,
    latitude: DEFAULT_SITE_PLAN.latitude,
    buildingHeight: DEFAULT_SITE_PLAN.buildingHeight,
    neighbors: DEFAULT_SITE_PLAN.neighbors,
    floors: DEFAULT_SITE_PLAN.floors,
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
  if (!Array.isArray(data.neighbors) || !data.neighbors.every(isNeighbor)) return null
  if (!FLOORS.includes(data.floors as Floors)) return null
  return normalizePlan(data as unknown as SitePlan)
}

/** Rounds to units of 0.1 m (does not keep the fine fractions that dragging produces) */
export function round1(v: number): number {
  return Math.round(v * 10) / 10
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max))
}

/** Depth of the section (m). Target area / width. Does not exceed the depth of the land */
export function sectionDepth(plan: SitePlan): number {
  return Math.min(tsuboToM2(plan.targetTsubo) / plan.sectionWidth, plan.landDepth)
}

/** Area of the building footprint (building area, ㎡). Total floor area / number of floors
 * (viewed as a full two-story) */
export function buildingFootprint(plan: SitePlan): number {
  return tsuboToM2(plan.buildingTsubo) / plan.floors
}

/** Depth of the building (m). Footprint area / width */
export function buildingDepth(plan: SitePlan): number {
  return buildingFootprint(plan) / plan.buildingWidth
}

/** The name of the building shown in figures and labels ("平屋 35坪" (single-story, 35
 * tsubo), "2 階建て 35坪" (two-story, 35 tsubo)) */
export function buildingLabel(plan: SitePlan): string {
  return `${FLOORS_LABEL[plan.floors]} ${plan.buildingTsubo}坪`
}

/**
 * Fits the values inside the land and the section. The section width goes up to the
 * frontage of the land, the section stays inside the land, and the building stays inside
 * the section (the exterior wall setback is not something to "fit", and is reported by the
 * checks). The width of the flag-lot access strip goes up to the section width.
 *
 * When the passage to the parking lot (parkingAccess) is enabled and land remains behind
 * the section, the section width and its left-right position are tightened to avoid the
 * strip of the passage at the end of the land. Tightening the width lengthens the depth, so
 * the depth is recomputed and then the distance from the road is fitted again (the
 * tightened width is kept as is, and is not widened again on its own).
 */
export function normalizePlan(plan: SitePlan): SitePlan {
  const landWidth = Math.max(plan.landWidth, 1)
  const landDepth = Math.max(plan.landDepth, 1)
  const accessWidth = clamp(plan.accessWidth, 0, landWidth - 1)
  let sectionWidth = clamp(plan.sectionWidth, 1, landWidth)
  const roadWidth = clamp(plan.roadWidth, 0, 50)
  // Keep only the parcel boundaries inside the land, in order from the left, without duplicates
  const lotLines = [...new Set(plan.lotLines.map(round1))]
    .filter((v) => v > 0 && v < landWidth)
    .sort((a, b) => a - b)
  const neighbors = plan.neighbors.slice(0, NEIGHBORS_MAX).map((n) => ({
    ...n,
    label: n.label.slice(0, NEIGHBOR_LABEL_MAX),
    width: Math.max(n.width, 0.5),
    depth: Math.max(n.depth, 0.5),
    height: clamp(n.height, 0, 100),
  }))
  const next: SitePlan = {
    ...plan,
    landWidth,
    landDepth,
    accessWidth,
    sectionWidth,
    roadWidth,
    lotLines,
    facingOffset: clamp(plan.facingOffset, -45, 45),
    latitude: clamp(plan.latitude, 20, 46),
    buildingHeight: clamp(plan.buildingHeight, 2, 15),
    neighbors,
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

/** The flag-lot access strip (the passage from the road to the section). null when the
 * section touches the road */
export function flagRect(plan: SitePlan): Rect | null {
  if (plan.sectionY <= 0 || plan.flagWidth <= 0) return null
  const x =
    plan.flagSide === 'left' ? plan.sectionX : plan.sectionX + plan.sectionWidth - plan.flagWidth
  return { x, y: 0, width: plan.flagWidth, depth: plan.sectionY }
}

/**
 * The passage to the remaining land (the parking lot). Taken at the left or right end of the
 * land, from the road to the rear edge of the section. null when the passage is disabled,
 * or when no land remains behind the section (the section reaches the rear of the land)
 */
export function accessRect(plan: SitePlan): Rect | null {
  if (!plan.parkingAccess || plan.accessWidth <= 0) return null
  const reach = plan.sectionY + sectionDepth(plan)
  if (plan.landDepth - reach <= 0.01) return null
  const x = plan.accessSide === 'left' ? 0 : plan.landWidth - plan.accessWidth
  return { x, y: 0, width: plan.accessWidth, depth: reach }
}

/** Area per car used for the rough estimate of the number of parking spaces (㎡. A rough
 * guide that adds a share of the aisle to a 2.5x5m space) */
export const PARKING_M2_PER_CAR = 30

/** The building footprint (in the land coordinate system) */
export function buildingRect(plan: SitePlan): Rect {
  return {
    x: plan.sectionX + plan.buildingX,
    y: plan.sectionY + plan.buildingY,
    width: plan.buildingWidth,
    depth: buildingDepth(plan),
  }
}

/** Minimum length (m) over which the site must touch the road. Article 43 of the Building
 * Standards Act */
export const MIN_FRONTAGE = 2

/** Rough guide for the width of a passage that 1 car can pass through (m). A car cannot
 * enter at the legal minimum (2m) */
export const CAR_LANE_WIDTH = 3

/** Distance of the part at risk of fire spread (m, 1st floor). Measured from the adjacent
 * land boundary line and the road center line (article 2 item 6 of the Building Standards
 * Act) */
export const FIRE_SPREAD_DISTANCE = 3
/** The same for the 2nd floor and above (m) */
export const FIRE_SPREAD_DISTANCE_UPPER = 5

/**
 * The upper limit of the floor area ratio due to the width of the front road (%). When the
 * width is less than 12m it is width x 0.4 (residential use districts), and the smaller of
 * it and the designated floor area ratio applies (article 52 paragraph 2 of the Building
 * Standards Act)
 */
export function effectiveFloorAreaRatio(plan: SitePlan): number {
  if (plan.roadWidth >= 12) return plan.floorAreaRatio
  return Math.min(plan.floorAreaRatio, Math.round(plan.roadWidth * 40))
}

/** Which compass direction the front, rear, left and right of the section each face
 * (follows from the direction of the road. Kept consistent with north on screen) */
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
 * The fire-spread line (section coordinates, the origin is the near left corner of the
 * section). Outside this rectangle is the part at risk of fire spread. When the section
 * touches the road, the front is 3m from the road center line (= 3m - road width/2 from the
 * boundary), and when it does not, the front is also 3m as an adjacent land boundary line.
 * The left, right and rear are 3m as adjacent land (the remaining land is also a separate
 * site after the split)
 */
export function fireSafeRect(plan: SitePlan, distance: number = FIRE_SPREAD_DISTANCE): Rect {
  const sDepth = sectionDepth(plan)
  const front = plan.sectionY <= 0 ? Math.max(distance - plan.roadWidth / 2, 0) : distance
  return {
    x: distance,
    y: front,
    width: Math.max(plan.sectionWidth - distance * 2, 0),
    depth: Math.max(sDepth - front - distance, 0),
  }
}

/** Turns the parcel boundary input ("10.5, 20", "10.5、20" and so on) into a list of numbers.
 * Pieces that cannot be read are dropped */
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
 * Which parcels the section overlaps. Parcels are numbered from the left starting at 0.
 * Parcel boundaries are assumed to run straight from the road to the rear, and the flag-lot
 * access strip lies within the section width, so only the left-right range of the section
 * needs to be looked at
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

/** The open space (m) available on the south side of the building within the section. Which
 * way "south" is on screen depends on the direction of the road */
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

/** The direction of north on screen (degrees. 0 = up, clockwise). The rotation for drawing
 * the road at the bottom */
export function northAngle(roadSide: RoadSide): number {
  return { S: 0, N: 180, E: 90, W: 270 }[roadSide]
}

/** The azimuths of +x (right) and +y (rear) of the land (degrees, north 0, clockwise). From
 * the direction of the road and the deviation of the actual direction */
export function landAxes(plan: SitePlan): { rightAz: number; backAz: number } {
  const front = { S: 180, N: 0, E: 90, W: 270 }[plan.roadSide] + plan.facingOffset
  const backAz = (front + 180 + 360) % 360
  return { rightAz: (backAz + 90) % 360, backAz }
}

/** The surrounding buildings included in the sunlight calculation (those with a known height) */
export function shadingBoxes(plan: SitePlan): (Box & { label: string })[] {
  return plan.neighbors
    .filter((n) => n.kind !== 'open' && n.height > 0)
    .map(({ label, x, y, width, depth, height }) => ({ label, x, y, width, depth, height }))
}

/** The time window (true solar time) and the step (hours) for looking at sunlight */
export const SUN_START = 8
export const SUN_END = 16
const SUN_STEP = 1 / 6
/** Rough window height (m, around the middle of a floor-to-ceiling sliding window) */
const WINDOW_Z = 1

export type SunReport = {
  /** The compass direction of the exterior wall facing south (it becomes something other
   * than '南' when the land is rotated a lot) */
  wall: string
  /** Sunlight hours at 5 points on the exterior wall (hours) */
  hours: number[]
  average: number
  min: number
  /** For each building that cast a shadow, the time it blocked, averaged over the 5 points
   * (hours). Longest first */
  blockers: { label: string; hours: number }[]
}

/**
 * The time the sun hits the most south-facing face of the exterior walls of the
 * single-story house, from 8 to 16 o'clock (true solar time) in the given season. Looks at
 * 5 points on the exterior wall (both ends slightly inward) at window height, and counts in
 * 10 minute steps whether they are blocked by the surrounding buildings and whether the sun
 * has gone behind the exterior wall
 */
export function sunOnSouthWall(plan: SitePlan, season: Season = 'winter'): SunReport {
  const { rightAz, backAz } = landAxes(plan)
  const walls = [
    { side: 'front', az: backAz + 180, nx: 0, ny: -1 },
    { side: 'back', az: backAz, nx: 0, ny: 1 },
    { side: 'left', az: rightAz + 180, nx: -1, ny: 0 },
    { side: 'right', az: rightAz, nx: 1, ny: 0 },
  ] as const
  const offSouth = (az: number) => Math.abs(((((az - 180) % 360) + 540) % 360) - 180)
  const wall = walls.reduce((a, b) => (offSouth(b.az) < offSouth(a.az) ? b : a))
  const b = buildingRect(plan)
  const along = wall.nx === 0
  const samples = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => ({
    x: along ? b.x + b.width * f : wall.nx < 0 ? b.x : b.x + b.width,
    y: along ? (wall.ny < 0 ? b.y : b.y + b.depth) : b.y + b.depth * f,
    z: WINDOW_Z,
  }))
  const boxes = shadingBoxes(plan)
  const blocked = new Map<string, number>()
  const hours = samples.map(() => 0)
  const decl = SEASON_DECLINATION[season]
  for (let t = SUN_START + SUN_STEP / 2; t < SUN_END; t += SUN_STEP) {
    const { altitude, azimuth } = solarPosition(plan.latitude, decl, t)
    if (altitude <= 0) continue
    const sun = sunInLand(altitude, azimuth, rightAz, backAz)
    if (sun.x * wall.nx + sun.y * wall.ny <= 0) continue
    samples.forEach((p, i) => {
      const hit = boxes.find((box) => rayHitsBox(p, sun, box))
      if (hit) blocked.set(hit.label, (blocked.get(hit.label) ?? 0) + SUN_STEP / samples.length)
      else hours[i]! += SUN_STEP
    })
  }
  return {
    wall: sideDirections(plan.roadSide)[wall.side],
    hours,
    average: hours.reduce((a, v) => a + v, 0) / hours.length,
    min: Math.min(...hours),
    blockers: [...blocked]
      .map(([label, h]) => ({ label, hours: h }))
      .sort((a, c) => c.hours - a.hours),
  }
}

/** Rough guide for how long the sun should hit the south exterior wall on the winter
 * solstice (hours) */
export const WINTER_SUN_TARGET = 4

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
  /** The upper limit of the floor area ratio with the width of the front road applied (%) */
  floorAreaLimit: number
  /** Sunlight on the south exterior wall on the winter solstice */
  winterSun: SunReport
  /** Area of the passage to the parking lot (included in the remaining land). 0 when there
   * is no passage */
  accessArea: number
  checks: SiteCheck[]
}

function fmt(v: number, digits = 1): string {
  return v.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

/** Computes the areas and ratios, and lists the points to check as ok / warn / ng */
export function evaluateSite(plan: SitePlan): SiteEvaluation {
  const section = sectionRect(plan)
  const flag = flagRect(plan)
  const sectionArea = section.width * section.depth
  const flagArea = flag ? flag.width * flag.depth : 0
  const siteArea = sectionArea + flagArea
  const landArea = plan.landWidth * plan.landDepth
  const remainingArea = landArea - siteArea
  const buildingArea = buildingFootprint(plan)
  const coverageUsed = (buildingArea / siteArea) * 100
  const floorAreaUsed = (tsuboToM2(plan.buildingTsubo) / siteArea) * 100
  const gap = southGap(plan)
  const checks: SiteCheck[] = []

  // 1. Whether the target area is secured (the section shrinks when the land is not deep enough)
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

  // 2. Road frontage (Building Standards Act: the site touches the road over 2m or more)
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

  // 3. Whether the remaining land keeps touching the road (using the whole front leaves the
  // rear land with no road frontage)
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

  // 3b. The passage to the remaining land (the parking lot)
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

  // 4. Building coverage ratio and floor area ratio
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

  // 5. Exterior wall setback (the distance between the building and the section boundary)
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

  // 5b. Quasi-fire-prevention district: exterior walls that fall in the part at risk of fire
  // spread
  if (plan.quasiFireZone) {
    const dir = sideDirections(plan.roadSide)
    const sidesWithin = (distance: number) => {
      const safe = fireSafeRect(plan, distance)
      return [
        plan.buildingY + 0.01 < safe.y ? dir.front : null,
        plan.buildingY + bDepth > safe.y + safe.depth + 0.01 ? dir.back : null,
        plan.buildingX + 0.01 < safe.x ? dir.left : null,
        plan.buildingX + plan.buildingWidth > safe.x + safe.width + 0.01 ? dir.right : null,
      ].filter((v): v is string => v !== null)
    }
    const lower = sidesWithin(FIRE_SPREAD_DISTANCE)
    const upper = plan.floors >= 2 ? sidesWithin(FIRE_SPREAD_DISTANCE_UPPER) : []
    const parts = [
      lower.length > 0
        ? `${plan.floors >= 2 ? '1 階は' : ''}${lower.join('・')}側の外壁が ${FIRE_SPREAD_DISTANCE}m 以内`
        : null,
      upper.length > 0
        ? `2 階は${upper.join('・')}側の外壁が ${FIRE_SPREAD_DISTANCE_UPPER}m 以内`
        : null,
    ].filter((v): v is string => v !== null)
    checks.push(
      parts.length > 0
        ? {
            id: 'fire',
            status: 'warn',
            label: '延焼のおそれのある部分（準防火地域）',
            detail: `隣地境界線・道路中心線から、${parts.join('、')}にかかる。その範囲の窓・玄関ドアは防火設備（網入り・防火サッシ）になる。外壁・軒裏の防火構造はどこでも要る`,
          }
        : {
            id: 'fire',
            status: 'ok',
            label: '延焼のおそれのある部分（準防火地域）',
            detail: `建物は延焼ラインの内側で、窓を防火設備にしなくてよい。外壁・軒裏の防火構造は要る`,
          },
    )
  }

  // 5c. Parcel boundaries (when the section is taken from land of 2 or more parcels)
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

  // 5d. Sunlight on the winter solstice (including the shadows of the surrounding buildings)
  const winterSun = sunOnSouthWall(plan, 'winter')
  const fmtH = (h: number) => `${fmt(h)}時間`
  const blockers = winterSun.blockers
    .filter((b) => b.hours >= 0.05)
    .map((b) => `${b.label} ${fmtH(b.hours)}`)
  checks.push({
    id: 'sun',
    status: winterSun.min >= WINTER_SUN_TARGET ? 'ok' : 'warn',
    label: '冬至の日当たり',
    detail:
      `${winterSun.wall}側の窓に ${SUN_START}〜${SUN_END} 時で平均 ${fmtH(winterSun.average)}（短い所で ${fmtH(winterSun.min)}）。` +
      (blockers.length > 0
        ? `影を落とすのは ${blockers.join('・')}。`
        : '周りの建物の影はかからない。') +
      `${WINTER_SUN_TARGET}時間以上が目安`,
  })

  // 6. Open space on the south side (a rough guide for the sunlight of a single-story
  // house). When the south of the section is the road, the road width also counts as open space
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
    winterSun,
    accessArea,
    checks,
  }
}

/** Moves the section to the road side (the front) */
export function moveSectionToFront(plan: SitePlan): SitePlan {
  return normalizePlan({ ...plan, sectionY: 0 })
}

/** Moves the section to the rear (the side opposite the road) */
export function moveSectionToBack(plan: SitePlan): SitePlan {
  return normalizePlan({ ...plan, sectionY: plan.landDepth })
}

/**
 * Places the building where "the open space on the south side is largest" (moves it to the
 * side opposite south within the section, and keeps it away by the exterior wall setback).
 * Left-right (the direction perpendicular to north-south) is the center of the section.
 */
export function placeBuildingNorth(plan: SitePlan): SitePlan {
  const sDepth = sectionDepth(plan)
  const bDepth = buildingDepth(plan)
  const centerX = (plan.sectionWidth - plan.buildingWidth) / 2
  const centerY = (sDepth - bDepth) / 2
  // The far-side position is rounded down to units of 0.1m (rounding to nearest can cut into
  // the setback from the boundary)
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
