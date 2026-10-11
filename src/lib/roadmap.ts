/**
 * "家づくりのロードマップ" (House-building roadmap) on the home page: the fixed stages of
 * building a custom house and where the two of them are now (pure functions).
 *
 * The current stage is the setting `roadmap` (JSON, `Roadmap` below). Only the stage id is
 * held; dates, the land and the money stay outside the app (design.md §1). The stages are
 * generic to a custom house in Japan and are not tied to a vendor.
 *
 * The drawing is a road that winds in 2 rows (left to right, a U-turn, right to left) so
 * that 8 labels fit the width of a phone. The label of the 4th stage sits inside the
 * U-turn, so it must stay at 4 characters or fewer (a longer one runs into the arc). `roadmapGeometry` gives the SVG numbers so that
 * the component only draws.
 */

export const ROADMAP_STAGES = [
  { id: 'research', label: '情報収集', hint: '展示場・見学会・動画で学ぶ' },
  { id: 'vendor', label: '業者選び', hint: '候補を比べて相談する' },
  { id: 'land', label: '土地・資金', hint: '敷地の条件を確かめ、ローンの事前審査' },
  { id: 'plan', label: 'プラン', hint: '間取りの提案と概算の見積' },
  { id: 'contract', label: '契約', hint: '工事請負契約を結ぶ' },
  { id: 'design', label: '詳細設計', hint: '仕様を決め、建築確認を受ける' },
  { id: 'build', label: '着工・上棟', hint: '地鎮祭・基礎・上棟・内装' },
  { id: 'handover', label: '引き渡し', hint: '完成検査・引き渡し・入居' },
] as const

export type RoadmapStageId = (typeof ROADMAP_STAGES)[number]['id']
export const ROADMAP_STAGE_IDS = ROADMAP_STAGES.map((s) => s.id) as [
  RoadmapStageId,
  ...RoadmapStageId[],
]

export type Roadmap = {
  version: 1
  /** The stage the two of them are in now */
  stage: RoadmapStageId
}

/** Before anything is saved, the couple is gathering information */
export const DEFAULT_ROADMAP: Roadmap = { version: 1, stage: 'research' }

export function isRoadmapStageId(v: unknown): v is RoadmapStageId {
  return typeof v === 'string' && (ROADMAP_STAGE_IDS as string[]).includes(v)
}

/**
 * Reads the JSON string of the setting `roadmap`. A missing or broken value falls back to
 * the default (the roadmap is always shown; the worst case is "情報収集" (Information
 * gathering) until somebody moves it)
 */
export function parseRoadmap(raw: string | null | undefined): Roadmap {
  if (!raw) return DEFAULT_ROADMAP
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_ROADMAP
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_ROADMAP
  const stage = (parsed as Record<string, unknown>).stage
  return isRoadmapStageId(stage) ? { version: 1, stage } : DEFAULT_ROADMAP
}

/** 0-based position of a stage. The default stage when the id is unknown */
export function stageIndex(id: string): number {
  const i = ROADMAP_STAGE_IDS.indexOf(id as RoadmapStageId)
  return i === -1 ? 0 : i
}

export function stageOf(id: RoadmapStageId) {
  return ROADMAP_STAGES[stageIndex(id)]
}

export type StageState = 'done' | 'current' | 'todo'

export function stageState(index: number, currentIndex: number): StageState {
  if (index < currentIndex) return 'done'
  return index === currentIndex ? 'current' : 'todo'
}

/** Text of the SVG for assistive technology: how many stages and which one is now */
export function roadmapDescription(stage: RoadmapStageId): string {
  const i = stageIndex(stage)
  return `家づくりのロードマップ。${ROADMAP_STAGES.length} 段階のうち、いまは ${i + 1} 番目の「${ROADMAP_STAGES[i].label}」`
}

// ---- Geometry ----------------------------------------------------------------------------

/** viewBox of the drawing. Width is the width of a phone so that 12px text stays 12px */
export const ROADMAP_WIDTH = 360
export const ROADMAP_HEIGHT = 164
/** Where the 4 nodes of a row sit. The arc of the U-turn needs the room to the right */
const COLUMN_XS = [50, 130, 210, 290] as const
const ROW_YS = [46, 118] as const
/** Radius of the U-turn (half the distance between the rows) */
const TURN_RADIUS = (ROW_YS[1] - ROW_YS[0]) / 2
const ROAD_START_X = 14

export type RoadmapNode = {
  x: number
  y: number
  /** Baseline of the label under the node */
  labelY: number
  /** Top edge of the "現在地" (You are here) pin above the node */
  pinY: number
}

/** Position of every stage on the winding road, in stage order */
export function roadmapNodes(): RoadmapNode[] {
  const row = (y: number) => ({
    y,
    labelY: y + 26,
    pinY: y - 38,
  })
  const first = COLUMN_XS.map((x) => ({ x, ...row(ROW_YS[0]) }))
  const second = [...COLUMN_XS].reverse().map((x) => ({ x, ...row(ROW_YS[1]) }))
  return [...first, ...second]
}

/**
 * SVG path of the road from its start up to the node at `until` (inclusive). The full road
 * is `until = ROADMAP_STAGES.length - 1`; the part that is done ends at the current node
 */
export function roadPath(until: number): string {
  const nodes = roadmapNodes()
  const last = Math.max(0, Math.min(until, nodes.length - 1))
  const turn = COLUMN_XS.length - 1
  const parts = [`M ${ROAD_START_X} ${ROW_YS[0]}`]
  if (last <= turn) {
    parts.push(`H ${nodes[last].x}`)
    return parts.join(' ')
  }
  parts.push(`H ${nodes[turn].x}`)
  parts.push(`A ${TURN_RADIUS} ${TURN_RADIUS} 0 0 1 ${nodes[turn + 1].x} ${ROW_YS[1]}`)
  if (last > turn + 1) parts.push(`H ${nodes[last].x}`)
  return parts.join(' ')
}
