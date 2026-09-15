/**
 * 国土地理院 住所検索 API（キー不要・同一 IP 10 秒 10 回・継続保証なし）の
 * URL 組み立てとレスポンス解析。呼び出し（fetch）は src/server/geocode.ts。
 */

export const GSI_ADDRESS_SEARCH = 'https://msearch.gsi.go.jp/address-search/AddressSearch'

export function normalizeAddress(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[－ー―‐]/g, '-')
    .replace(/(\d+)丁目(\d+)番(\d+)号?/u, '$1-$2-$3')
    .replace(/(\d+)丁目(\d+)番地?(?!\d)/u, '$1-$2')
}

export function buildGsiUrl(query: string): string {
  return `${GSI_ADDRESS_SEARCH}?q=${encodeURIComponent(query)}`
}

export type GeocodeHit = { lat: number; lng: number; title: string | null }

function inRange(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

export function parseGsiResponse(json: unknown): GeocodeHit | null {
  if (!Array.isArray(json) || json.length === 0) return null
  const first = json[0] as {
    geometry?: { coordinates?: unknown }
    properties?: { title?: unknown }
  }
  const coords = first?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  const [lng, lat] = coords
  if (typeof lat !== 'number' || typeof lng !== 'number' || !inRange(lat, lng)) return null
  const title = typeof first.properties?.title === 'string' ? first.properties.title : null
  return { lat, lng, title }
}
