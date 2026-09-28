/**
 * The contents of the scene passed to the 3D view of the site plan simulator (pure
 * functions). Rendering (three.js) is handled by src/components/site/SiteView3D.tsx, and
 * this file decides only what is placed where.
 *
 * Coordinates are held in land coordinates (m. x: along the frontage, y: road -> rear,
 * z: height), and are mapped to three.js coordinates (Y is up) by toThree. The rear of the
 * land (+y) becomes the back of the screen (-Z).
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

/** Provisional height (m) for a neighboring building whose height is unknown. Drawn
 * semi-transparent and not used in calculations */
export const UNKNOWN_HEIGHT = 3

export type ScenePlaneKind = 'road' | 'land' | 'open' | 'access' | 'section' | 'flag'
export type ScenePlane = Rect & { kind: ScenePlaneKind; label?: string }

export type SceneBoxKind = 'house' | 'building' | 'construction' | 'unknown'
export type SceneBox = Rect & { kind: SceneBoxKind; height: number; label: string }

export type Scene = {
  planes: ScenePlane[]
  boxes: SceneBox[]
  /** Extent of the whole scene (land coordinates) */
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}

function boxKind(kind: NeighborKind, height: number): SceneBoxKind {
  if (height <= 0) return 'unknown'
  return kind === 'construction' ? 'construction' : 'building'
}

/** Builds the 3D scene from the values of the site plan simulator. The road is stretched to
 * the full left-right extent of the scene */
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

/** Land coordinates -> three.js coordinates [X, Y, Z] (Y is up, the rear of the land is -Z) */
export function toThree(p: Vec3): [number, number, number] {
  return [p.x, p.z, -p.y]
}

/**
 * The direction of the sun (a unit vector in three.js coordinates) and its altitude. null
 * when the sun is not up. Placing the directional light at "scene center + direction x
 * distance" makes the shadows fall according to the direction of the sun
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

/** The direction pointing north in three.js coordinates (a unit vector in the XZ plane).
 * Used for the compass symbol */
export function northDirection3d(plan: SitePlan): [number, number] {
  const { rightAz, backAz } = landAxes(plan)
  // Map north (azimuth 0°) onto the x and y of the land, component by component
  const x = Math.cos(rightAz * (Math.PI / 180))
  const y = Math.cos(backAz * (Math.PI / 180))
  return [x, -y]
}
