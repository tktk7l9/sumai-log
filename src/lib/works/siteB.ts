import { absoluteUrl, pageLinks, textOf } from './html'
import type { SiteParser, WorkFields, WorkListEntry } from './types'

/**
 * Site B: a paginated list inside `<ul class="works-list ...">`; each item shows the category
 * and the title. The detail page has no data block, only the completion month in the body
 * ("竣工：2026年6月" = Completed: June 2026).
 */
function parseList(html: string, pageUrl: string) {
  const list = /<ul class="works-list[\s\S]*?<\/ul>/.exec(html)?.[0] ?? ''
  const entries: WorkListEntry[] = []
  for (const [, href, body] of list.matchAll(/<a href="([^"]+)">([\s\S]*?)<\/a>/g)) {
    const url = absoluteUrl(href as string, pageUrl)
    const title = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(body as string)
    if (!url || !title) continue
    const category = /<p class="font-sm">([\s\S]*?)<\/p>/.exec(body as string)
    entries.push({
      url,
      title: textOf(title[1] as string),
      category: category ? textOf(category[1] as string) : null,
    })
  }
  return { entries, pageUrls: pageLinks(html, pageUrl) }
}

function parseDetail(html: string): Partial<WorkFields> {
  // Not a detail page (an error or maintenance page served with 200): recognise nothing, so
  // the crawl counts it as failed instead of blanking the row
  if (!html.includes('class="works_container"')) return {}
  const match = /竣工\s*[:：]\s*(\d{4})年(?:\s*(\d{1,2})月)?/.exec(html.normalize('NFKC'))
  if (!match) return { completedOn: null }
  const [, year, month] = match
  return { completedOn: month ? `${year}-${month.padStart(2, '0')}` : (year as string) }
}

export const siteB: SiteParser = { parseList, parseDetail }
