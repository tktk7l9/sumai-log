import { parseArea, parseNumber } from './area'
import { absoluteUrl, findYouTubeId, pageLinks, textOf } from './html'
import type { SiteParser, WorkFields, WorkListEntry } from './types'

/**
 * Site C: a paginated list inside `<ul class="system-list">`; each item already shows the
 * category, the city, the floor area (m2), UA and C. The detail page only adds the tour video,
 * embedded in the body. Family and layout are in free prose and are not read.
 */
const SPEC =
  /system-total_area-span-01">([\s\S]*?)<\/span><span class="system-total_area-span-02">([\s\S]*?)<\/span>/g

function classText(body: string, pattern: RegExp): string | null {
  const match = pattern.exec(body)
  return match ? textOf(match[1] as string) : null
}

function parseList(html: string, pageUrl: string) {
  const list = /<ul class="system-list">[\s\S]*?<\/ul>/.exec(html)?.[0] ?? ''
  const entries: WorkListEntry[] = []
  for (const [, href, body] of list.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = absoluteUrl(href as string, pageUrl)
    const title = classText(body as string, /class="system-ttl-01">([\s\S]*?)<\/p>/)
    if (!url || !title) continue
    const specs = new Map<string, string>()
    for (const [, label, value] of (body as string).matchAll(SPEC)) {
      specs.set(textOf(label as string), textOf(value as string))
    }
    entries.push({
      url,
      title,
      category: classText(body as string, /class="cate-icon"><span[^>]*>([\s\S]*?)<\/span>/),
      location: classText(body as string, /class="system-area">([\s\S]*?)<\/p>/),
      floorAreaTsubo: parseArea(specs.get('延べ床面積') ?? ''),
      uaValue: parseNumber(specs.get('UA値') ?? ''),
      cValue: parseNumber(specs.get('C値') ?? ''),
    })
  }
  return { entries, pageUrls: pageLinks(html, pageUrl) }
}

function parseDetail(html: string): Partial<WorkFields> {
  // Not a detail page (an error or maintenance page served with 200): recognise nothing, so
  // the crawl counts it as failed instead of blanking the row
  if (!html.includes('class="system-ttl"')) return {}
  return { youtubeVideoId: findYouTubeId(html) }
}

export const siteC: SiteParser = { parseList, parseDetail }
