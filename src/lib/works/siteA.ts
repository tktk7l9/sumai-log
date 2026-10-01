import { parseLabeledArea, parseNumber } from './area'
import { absoluteUrl, findYouTubeId, textOf } from './html'
import type { SiteParser, WorkFields, WorkListEntry } from './types'

/**
 * Site A: one list page; every item is `<li><a href="<name>.php">...<dt>title</dt>...</a>
 * [tour video link]</li>` where <name> is lowercase letters, digits and underscores. The
 * detail page has a "Data" section (points, family, area, layout). The anchor contains nested
 * <li>, so an item is cut at the first </li> after </a>.
 */
const ITEM = /<a href="([a-z0-9_]+\.php)">([\s\S]*?)<\/a>([\s\S]*?)<\/li>/g

function parseList(html: string, pageUrl: string) {
  const entries = new Map<string, WorkListEntry>()
  for (const [, href, body, tail] of html.matchAll(ITEM)) {
    const url = absoluteUrl(href as string, pageUrl)
    const title = /<dt>([\s\S]*?)<\/dt>/.exec(body as string)
    if (!url || !title || entries.has(url)) continue
    entries.set(url, {
      url,
      title: textOf(title[1] as string),
      youtubeVideoId: findYouTubeId(tail as string),
    })
  }
  return { entries: [...entries.values()], pageUrls: [] }
}

/** th text -> td text of the table rows in the fragment */
function rowsOf(html: string): Map<string, string> {
  const rows = new Map<string, string>()
  for (const [, th, td] of html.matchAll(
    /<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g,
  )) {
    rows.set(textOf(th as string), textOf(td as string))
  }
  return rows
}

function labeledNumber(points: string[], label: string): number | null {
  const line = points.find((p) => p.includes(label))
  return line ? parseNumber(line.slice(line.indexOf(label))) : null
}

function parseDetail(html: string): Partial<WorkFields> {
  const section = /<section id="caseData"[\s\S]*?<\/section>/.exec(html)?.[0]
  if (!section) return {}
  const tags = /class="tags"[\s\S]*?<\/ul>/.exec(section)?.[0] ?? ''
  const points = [...tags.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1] as string))
  const rows = rowsOf(section)
  const area = rows.get('面積') ?? ''
  return {
    points,
    uaValue: labeledNumber(points, 'UA値'),
    cValue: labeledNumber(points, 'C値'),
    family: rows.get('家族構成') ?? null,
    siteAreaTsubo: parseLabeledArea(area, '敷地面積'),
    floorAreaTsubo: parseLabeledArea(area, '延床面積'),
    totalAreaTsubo: parseLabeledArea(area, '総施工面積'),
    layout: rows.get('間取り') ?? null,
  }
}

export const siteA: SiteParser = { parseList, parseDetail }
