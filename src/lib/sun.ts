/**
 * 日当たりの純粋関数（区画シミュレーター用）。太陽の位置・建物の影・ある点に日が当たるかを出す。
 *
 * 時刻は真太陽時（太陽が真南に来る時刻を 12 時とする）。均時差と経度の補正は入れない（数分〜
 * 十数分のずれで、日照時間の目安には効かない）。大気差も入れない。
 *
 * 方位は北を 0°・時計回り（東 90°・南 180°）。土地の座標（x: 間口方向、y: 道路→奥、z: 高さ）へは
 * 「右（+x）の方位」と「奥（+y）の方位」で写す。
 */

export const SEASONS = ['winter', 'equinox', 'summer'] as const
export type Season = (typeof SEASONS)[number]
export const SEASON_LABEL: Record<Season, string> = {
  winter: '冬至',
  equinox: '春分・秋分',
  summer: '夏至',
}
/** 太陽の赤緯（度） */
export const SEASON_DECLINATION: Record<Season, number> = {
  winter: -23.44,
  equinox: 0,
  summer: 23.44,
}

const RAD = Math.PI / 180

export type Vec3 = { x: number; y: number; z: number }
export type Point = { x: number; y: number }
export type Box = { x: number; y: number; width: number; depth: number; height: number }

/** 太陽の高度・方位（度）。hour は真太陽時（12 = 南中） */
export function solarPosition(
  latitude: number,
  declination: number,
  hour: number,
): { altitude: number; azimuth: number } {
  const phi = latitude * RAD
  const delta = declination * RAD
  const h = (hour - 12) * 15 * RAD
  const east = -Math.cos(delta) * Math.sin(h)
  const north = Math.sin(delta) * Math.cos(phi) - Math.cos(delta) * Math.sin(phi) * Math.cos(h)
  const up = Math.sin(delta) * Math.sin(phi) + Math.cos(delta) * Math.cos(phi) * Math.cos(h)
  const azimuth = (Math.atan2(east, north) / RAD + 360) % 360
  return { altitude: Math.asin(up) / RAD, azimuth }
}

/** 太陽の方向（単位ベクトル）を土地の座標で。rightAz / backAz は土地の +x / +y の方位（度） */
export function sunInLand(
  altitude: number,
  azimuth: number,
  rightAz: number,
  backAz: number,
): Vec3 {
  const horizontal = Math.cos(altitude * RAD)
  const e = horizontal * Math.sin(azimuth * RAD)
  const n = horizontal * Math.cos(azimuth * RAD)
  return {
    x: e * Math.sin(rightAz * RAD) + n * Math.cos(rightAz * RAD),
    y: e * Math.sin(backAz * RAD) + n * Math.cos(backAz * RAD),
    z: Math.sin(altitude * RAD),
  }
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/** 凸包（Andrew の単調連鎖）。反時計回り */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const lower: Point[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** 箱（建物）が地面に落とす影の多角形。日が出ていない・高さが無ければ null */
export function shadowPolygon(box: Box, sun: Vec3): Point[] | null {
  if (sun.z <= 0 || box.height <= 0) return null
  const k = box.height / sun.z
  const dx = -sun.x * k
  const dy = -sun.y * k
  const corners: Point[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.depth },
    { x: box.x, y: box.y + box.depth },
  ]
  return convexHull([...corners, ...corners.map((c) => ({ x: c.x + dx, y: c.y + dy }))])
}

/** 点 p から太陽へ向かう光線が箱に当たるか（＝p はその箱の影の中か） */
export function rayHitsBox(p: Vec3, sun: Vec3, box: Box): boolean {
  if (sun.z <= 0 || box.height <= p.z) return false
  // 箱の高さに届くまでの距離。そこまでに箱の平面形に入れば遮られる
  const tMax = (box.height - p.z) / sun.z
  let t0 = 0
  let t1 = tMax
  for (const [origin, dir, min, max] of [
    [p.x, sun.x, box.x, box.x + box.width],
    [p.y, sun.y, box.y, box.y + box.depth],
  ] as const) {
    if (Math.abs(dir) < 1e-12) {
      if (origin < min || origin > max) return false
      continue
    }
    let a = (min - origin) / dir
    let b = (max - origin) / dir
    if (a > b) [a, b] = [b, a]
    t0 = Math.max(t0, a)
    t1 = Math.min(t1, b)
    if (t0 > t1) return false
  }
  return true
}
