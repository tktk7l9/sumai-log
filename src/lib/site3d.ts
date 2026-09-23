/**
 * 区画シミュレーターの 3D 表示に渡すシーンの中身（純粋関数）。描画（three.js）は
 * src/components/site/SiteView3D.tsx が受け持ち、ここは「何をどこに置くか」だけを決める。
 *
 * 座標は土地の座標（m。x: 間口方向、y: 道路→奥、z: 高さ）で持ち、three.js の座標
 * （Y が上）へは toThree で写す。土地の奥（+y）は画面の奥（-Z）になる。
 */

import {
  accessRect,
  buildingLabel,
  buildingRect,
  flagRect,
  landAxes,
  sectionRect,
  type NeighborKind,
  type Rect,
  type SitePlan,
} from './sitePlan'
import { SEASON_DECLINATION, solarPosition, sunInLand, type Season, type Vec3 } from './sun'

/** 高さが不明な隣の建物を仮に立てる高さ（m）。半透明で描き、計算には使わない */
export const UNKNOWN_HEIGHT = 3

export type ScenePlaneKind = 'road' | 'land' | 'open' | 'access' | 'section' | 'flag'
export type ScenePlane = Rect & { kind: ScenePlaneKind; label?: string }

export type SceneBoxKind = 'house' | 'building' | 'construction' | 'unknown'
export type SceneBox = Rect & { kind: SceneBoxKind; height: number; label: string }

export type Scene = {
  planes: ScenePlane[]
  boxes: SceneBox[]
  /** シーン全体の広がり（土地の座標） */
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}

function boxKind(kind: NeighborKind, height: number): SceneBoxKind {
  if (height <= 0) return 'unknown'
  return kind === 'construction' ? 'construction' : 'building'
}

/** 区画シミュレーターの値から 3D のシーンを組む。道路はシーンの左右いっぱいに伸ばす */
export function buildScene(plan: SitePlan): Scene {
  const planes: ScenePlane[] = []
  const boxes: SceneBox[] = []

  for (const n of plan.neighbors) {
    if (n.kind === 'open') {
      planes.push({ kind: 'open', label: n.label, x: n.x, y: n.y, width: n.width, depth: n.depth })
    } else {
      boxes.push({
        kind: boxKind(n.kind, n.height),
        label: n.label,
        x: n.x,
        y: n.y,
        width: n.width,
        depth: n.depth,
        height: n.height > 0 ? n.height : UNKNOWN_HEIGHT,
      })
    }
  }

  const all: Rect[] = [
    { x: 0, y: -plan.roadWidth, width: plan.landWidth, depth: plan.landDepth + plan.roadWidth },
    ...planes,
    ...boxes,
  ]
  const bounds = {
    minX: Math.min(...all.map((r) => r.x)),
    maxX: Math.max(...all.map((r) => r.x + r.width)),
    minY: Math.min(...all.map((r) => r.y)),
    maxY: Math.max(...all.map((r) => r.y + r.depth)),
  }

  planes.unshift(
    {
      kind: 'road',
      x: bounds.minX,
      y: -plan.roadWidth,
      width: bounds.maxX - bounds.minX,
      depth: plan.roadWidth,
    },
    { kind: 'land', x: 0, y: 0, width: plan.landWidth, depth: plan.landDepth },
  )
  const access = accessRect(plan)
  if (access) planes.push({ kind: 'access', ...access })
  planes.push({ kind: 'section', ...sectionRect(plan) })
  const flag = flagRect(plan)
  if (flag) planes.push({ kind: 'flag', ...flag })

  boxes.push({
    kind: 'house',
    label: buildingLabel(plan),
    ...buildingRect(plan),
    height: plan.buildingHeight,
  })

  return { planes, boxes, bounds }
}

/** 土地の座標 → three.js の座標 [X, Y, Z]（Y が上、土地の奥は -Z） */
export function toThree(p: Vec3): [number, number, number] {
  return [p.x, p.z, -p.y]
}

/**
 * 太陽の方向（three.js の座標の単位ベクトル）と高度。日が出ていなければ null。
 * 平行光源を「シーンの中心 + 方向×距離」に置けば、影が太陽の向きに落ちる
 */
export function sunDirection3d(
  plan: SitePlan,
  season: Season,
  hour: number,
): { dir: [number, number, number]; altitude: number } | null {
  const { altitude, azimuth } = solarPosition(plan.latitude, SEASON_DECLINATION[season], hour)
  if (altitude <= 0) return null
  const { rightAz, backAz } = landAxes(plan)
  return { dir: toThree(sunInLand(altitude, azimuth, rightAz, backAz)), altitude }
}

/** three.js の座標で、北を指す向き（XZ 平面の単位ベクトル）。方位記号に使う */
export function northDirection3d(plan: SitePlan): [number, number] {
  const { rightAz, backAz } = landAxes(plan)
  // 北（方位 0°）を土地の x・y に分けて写す
  const x = Math.cos(rightAz * (Math.PI / 180))
  const y = Math.cos(backAz * (Math.PI / 180))
  return [x, -y]
}
