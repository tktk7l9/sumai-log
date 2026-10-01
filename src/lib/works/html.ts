/**
 * Small HTML helpers for the site parsers (src/lib/works/site*.ts). Regular expressions and
 * tag stripping only: the pages are simple, and no HTML parser is added as a dependency.
 */

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

/** Visible text of an HTML fragment on one line */
export function textOf(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|nbsp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] as string)
    .replace(/\s+/g, ' ')
    .trim()
}

/** href resolved against the page it was found on. null unless the result is http(s) */
export function absoluteUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

const YOUTUBE_ID =
  /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/

/** First YouTube video id linked or embedded in the fragment */
export function findYouTubeId(html: string): string | null {
  return YOUTUBE_ID.exec(html)?.[1] ?? null
}

/**
 * The other pages of a paginated list: links shaped `<list>/page/<n>/` under the same list as
 * pageUrl, without duplicates and without pageUrl itself
 */
export function pageLinks(html: string, pageUrl: string): string[] {
  const self = absoluteUrl(pageUrl, pageUrl)
  if (!self) return []
  const listBase = self.replace(/page\/\d+\/?$/, '')
  const found = new Set<string>()
  for (const match of html.matchAll(/href="([^"]*\/page\/\d+\/?)"/g)) {
    const url = absoluteUrl(match[1] as string, self)
    if (url && url !== self && url.startsWith(`${listBase}page/`)) found.add(url)
  }
  return [...found]
}
