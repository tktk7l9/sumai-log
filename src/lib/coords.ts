/**
 * 座標の読み取りと表示用フォーマット。
 *
 * kousan-admin `src/lib/maps.ts` から `LatLng` `parseCoordinate` `formatLatLng`
 * だけを移植したもの（Google Maps の URL 組み立ては持ってこない）。
 */

export type LatLng = { lat: number; lng: number }

// 12°34'56.7"N 123°45'01.2"E （プライム記号での表記も受ける）
const DMS =
  /^(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*["″]\s*([NS])[\s,]+(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*["″]\s*([EW])$/i

// 35.480528, 139.395167
const DECIMAL = /^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/

function inRange({ lat, lng }: LatLng): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

/**
 * 座標の文字列を読む。度分秒と十進のどちらも受ける。
 *
 * 台帳には調べた人が書いた表記のまま入れておき、変換はここでやる。
 * 十進に直した値だけを保存すると、元の記録と突き合わせられなくなる。
 * 読めない・範囲外の値は null を返し、画面側で「地図を出せない」と伝える。
 */
export function parseCoordinate(value: string | null | undefined): LatLng | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const dms = DMS.exec(trimmed)
  if (dms) {
    const [, latDeg, latMin, latSec, ns, lngDeg, lngMin, lngSec, ew] = dms
    // 分・秒が 60 以上の表記は書き間違いなので受けない
    if (Number(latMin) >= 60 || Number(latSec) >= 60) return null
    if (Number(lngMin) >= 60 || Number(lngSec) >= 60) return null

    const lat =
      (Number(latDeg) + Number(latMin) / 60 + Number(latSec) / 3600) *
      (ns.toUpperCase() === 'S' ? -1 : 1)
    const lng =
      (Number(lngDeg) + Number(lngMin) / 60 + Number(lngSec) / 3600) *
      (ew.toUpperCase() === 'W' ? -1 : 1)
    const parsed = { lat, lng }
    return inRange(parsed) ? parsed : null
  }

  const decimal = DECIMAL.exec(trimmed)
  if (decimal) {
    const parsed = { lat: Number(decimal[1]), lng: Number(decimal[2]) }
    return inRange(parsed) ? parsed : null
  }

  return null
}

/** 座標を地図に渡す形にする。度分秒の割り算で出た端数は 6 桁で落とす（約 0.1m） */
export function formatLatLng({ lat, lng }: LatLng): string {
  const round = (value: number) => Number(value.toFixed(6)).toString()
  return `${round(lat)},${round(lng)}`
}
