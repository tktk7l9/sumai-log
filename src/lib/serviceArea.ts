/**
 * Service area matching. People write the values freely ("Test City", "Kanagawa
 * Prefecture", "Kanto", "nationwide"), so this looks at whether it "probably covers" by
 * string containment, not by strict address codes.
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
