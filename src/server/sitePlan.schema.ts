import { z } from 'zod'

import { NEIGHBOR_KINDS, NEIGHBOR_LABEL_MAX, NEIGHBORS_MAX, ROAD_SIDES } from '../lib/sitePlan'

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
  parkingAccess: z.boolean(),
  accessWidth: meters(50),
  accessSide: z.enum(['left', 'right']),
  floors: z.union([z.literal(1), z.literal(2)]),
  buildingTsubo: z.number().min(5).max(300),
  buildingWidth: z.number().min(1).max(500),
  buildingX: meters(500),
  buildingY: meters(500),
  coverageRatio: z.number().min(10).max(100),
  floorAreaRatio: z.number().min(10).max(1000),
  setback: meters(10),
  roadWidth: meters(50),
  quasiFireZone: z.boolean(),
  lotLines: z.array(meters(500)).max(20),
  facingOffset: z.number().min(-45).max(45),
  latitude: z.number().min(20).max(46),
  buildingHeight: z.number().min(2).max(15),
  // 隣地は土地の外（負の座標）にも置く
  neighbors: z
    .array(
      z.object({
        label: z.string().max(NEIGHBOR_LABEL_MAX),
        kind: z.enum(NEIGHBOR_KINDS),
        x: z.number().min(-500).max(1000),
        y: z.number().min(-500).max(1000),
        width: z.number().min(0.5).max(500),
        depth: z.number().min(0.5).max(500),
        height: z.number().min(0).max(100),
      }),
    )
    .max(NEIGHBORS_MAX),
})
