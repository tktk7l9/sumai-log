import { z } from 'zod'

import { ROAD_SIDES } from '../lib/sitePlan'

/**
 * 区画シミュレーターの保存値（設定 `sitePlan`）。sitePlan.ts から分離しているのは
 * candidates.schema.ts と同じ理由（createServerFn を素の workers テストから import できない）。
 * 寸法の数値だけを持ち、所在地・地番・座標は持たない（design.md §1）。
 */
const meters = (max: number) => z.number().min(0).max(max)

export const sitePlanInput = z.object({
  version: z.literal(1),
  landWidth: z.number().min(1).max(500),
  landDepth: z.number().min(1).max(500),
  roadSide: z.enum(ROAD_SIDES),
  targetTsubo: z.number().min(10).max(2000),
  sectionWidth: z.number().min(1).max(500),
  sectionX: meters(500),
  sectionY: meters(500),
  flagWidth: meters(50),
  flagSide: z.enum(['left', 'right']),
  buildingTsubo: z.number().min(5).max(300),
  buildingWidth: z.number().min(1).max(500),
  buildingX: meters(500),
  buildingY: meters(500),
  coverageRatio: z.number().min(10).max(100),
  floorAreaRatio: z.number().min(10).max(1000),
  setback: meters(10),
})
