export const PARSER_NAMES = ['siteA', 'siteB', 'siteC'] as const

export type SiteConfig = {
  /** Stored in works.site */
  key: string
  parser: (typeof PARSER_NAMES)[number]
  /** First list page. https only */
  listUrl: string
  /** vendors.id to link the works to, or null */
  vendorId: string | null
}

function fail(reason: string): never {
  throw new Error(`seed.local/works-sites.json: ${reason}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Validates seed.local/works-sites.json (gitignored: which sites are imported is real data and
 * is not written in the repository).
 * Shape: { "sites": [{ "key", "parser", "listUrl", "vendorId"? }] }
 */
export function parseSitesConfig(json: unknown): SiteConfig[] {
  if (!isRecord(json) || !Array.isArray(json.sites) || json.sites.length === 0) {
    fail('expected { "sites": [ ... ] } with at least one site')
  }
  const seen = new Set<string>()
  return (json.sites as unknown[]).map((raw, i) => {
    if (!isRecord(raw)) fail(`sites[${i}] is not an object`)
    const { key, parser, listUrl, vendorId = null } = raw
    if (typeof key !== 'string' || key === '' || seen.has(key)) {
      fail(`sites[${i}].key must be a unique, non-empty string`)
    }
    seen.add(key)
    const parserName = PARSER_NAMES.find((name) => name === parser)
    if (!parserName) fail(`sites[${i}].parser must be one of ${PARSER_NAMES.join(', ')}`)
    if (typeof listUrl !== 'string' || !listUrl.startsWith('https://')) {
      fail(`sites[${i}].listUrl must start with https://`)
    }
    if (vendorId !== null && typeof vendorId !== 'string') {
      fail(`sites[${i}].vendorId must be a string or null`)
    }
    return { key, parser: parserName, listUrl, vendorId }
  })
}
