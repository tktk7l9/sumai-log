import type { SiteConfig } from './config'
import {
  EMPTY_FIELDS,
  type ParsedWork,
  type SiteParser,
  type WorkFields,
  type WorkListEntry,
} from './types'

/** A list never has this many pages; the cap only stops a pagination that loops */
export const MAX_LIST_PAGES = 50

/** Detail values win, except that a null (or an empty list) does not erase what the list page gave */
function merge(entry: WorkListEntry, detail: Partial<WorkFields>): WorkFields {
  const { url: _url, ...fromList } = entry
  const merged: Record<string, unknown> = { ...EMPTY_FIELDS, ...fromList }
  for (const [key, value] of Object.entries(detail)) {
    if (value === null || (Array.isArray(value) && value.length === 0)) continue
    merged[key] = value
  }
  return merged as WorkFields
}

/**
 * Reads one site: every list page, then every detail page, through `load` (the script passes a
 * cached, rate-limited fetch). A work whose detail page could not be read is left out rather
 * than written half-empty, because the generated upsert would blank the columns it already has.
 */
export async function crawlSite(
  site: SiteConfig,
  parser: SiteParser,
  load: (url: string) => Promise<string>,
): Promise<{ works: ParsedWork[]; failed: string[] }> {
  const failed: string[] = []
  const entries = new Map<string, WorkListEntry>()
  const queue = [site.listUrl]
  const visited = new Set<string>()

  while (queue.length > 0 && visited.size < MAX_LIST_PAGES) {
    const pageUrl = queue.shift() as string
    if (visited.has(pageUrl)) continue
    visited.add(pageUrl)
    try {
      const page = parser.parseList(await load(pageUrl), pageUrl)
      for (const entry of page.entries) {
        if (!entries.has(entry.url)) entries.set(entry.url, entry)
      }
      queue.push(...page.pageUrls)
    } catch {
      failed.push(pageUrl)
    }
  }

  const works: ParsedWork[] = []
  let sortOrder = 0
  for (const entry of entries.values()) {
    const order = sortOrder++
    try {
      const fields = merge(entry, parser.parseDetail(await load(entry.url)))
      works.push({
        ...fields,
        title: fields.title ?? entry.url,
        sourceUrl: entry.url,
        site: site.key,
        vendorId: site.vendorId,
        sortOrder: order,
      })
    } catch {
      failed.push(entry.url)
    }
  }
  return { works, failed }
}
