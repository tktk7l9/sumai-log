/**
 * 施工エリアの判定。値は人が自由に書く（「座間市」「神奈川県」「関東」「全国」）ので、
 * 厳密な住所コードではなく文字列の包含で「含みそうか」を見る。
 */

export function parseAreaList(raw: string): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(/[,、\n\s]+/)) {
    const v = part.trim()
    if (v) seen.add(v)
  }
  return [...seen]
}

export function normalizeArea(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/(全域|エリア|一円)$/u, '')
}

export function areaCovers(serviceArea: string, homeArea: string): boolean {
  const s = normalizeArea(serviceArea)
  const h = normalizeArea(homeArea)
  if (!s || !h) return false
  if (s === '全国') return true
  return h === s || h.startsWith(s) || h.endsWith(s)
}

export function matchesHomeAreas(
  serviceAreas: readonly string[],
  homeAreas: readonly string[],
): boolean {
  return serviceAreas.some((s) => homeAreas.some((h) => areaCovers(s, h)))
}
