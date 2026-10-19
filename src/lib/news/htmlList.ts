/**
 * For vendors without RSS: turns the `<ul><li>` list of a news page into candidates
 * (a plain list of a date + title + relative link, like the builder without RSS in design.md
 * §1). No external HTML parser is used; extraction is done with regular expressions only.
 *
 * The date comes from the text of the li ("YYYY年M月D日" etc.) or, when the text has none,
 * from the link itself: an open-house list often shows only "M/D" while its pages are named
 * after the day (`index_20261114.php`, `20261212/`; 2026-10-19, when a vendor rebuilt its
 * site that way and the list went to 0 items). Commented-out markup and scripts are not
 * read, and one link gives one candidate however many lists repeat it.
 */

import { isRealDate } from './eventDate'
import type { NewsCandidate } from './rss'
import {
  decodeEntities,
  extractElementBlocks,
  MAX_INPUT_LENGTH,
  pad,
  removeInvisibleMarkup,
  stripTags,
  truncate,
} from './text'

const TITLE_MAX = 200

// One of "YYYY年M月D日", "YYYY.MM.DD", "YYYY/M/D". The leftmost match is taken.
const DATE_PATTERN =
  /(\d{4})年(\d{1,2})月(\d{1,2})日|(\d{4})\.(\d{1,2})\.(\d{1,2})|(\d{4})\/(\d{1,2})\/(\d{1,2})/

type DateMatch = { start: number; end: number; publishedOn: string }

/** Finds the first date notation in text already passed through stripTags. null when absent. */
function findDate(text: string): DateMatch | null {
  const match = DATE_PATTERN.exec(text)
  if (!match) return null

  const [year, month, day] =
    match[1] !== undefined
      ? [match[1], match[2], match[3]]
      : match[4] !== undefined
        ? [match[4], match[5], match[6]]
        : [match[7], match[8], match[9]]

  return {
    start: match.index,
    end: match.index + match[0].length,
    publishedOn: `${year}-${pad(Number(month))}-${pad(Number(day))}`,
  }
}

// A day in the path or query of a link: "YYYY-MM-DD", "/YYYY/M/D/" (blog permalinks) or
// "YYYYMMDD" (`index_20261114.php`, `20261212/`), bounded by non-digits. Only a 20xx year and
// (below) a real calendar day, so a product id or a phone number is not taken for a date.
const URL_DATE_PATTERNS = [
  /(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/g,
  /\/(20\d{2})\/(\d{1,2})\/(\d{1,2})(?=[/?#]|$)/g,
  /(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/g,
]

/** The first real calendar day written in the link. null when there is none. */
function findDateInUrl(url: string): string | null {
  const { pathname, search } = new URL(url)
  const haystack = pathname + search
  for (const pattern of URL_DATE_PATTERNS) {
    for (const match of haystack.matchAll(pattern)) {
      const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
      if (isRealDate(date)) return `${date.year}-${pad(date.month)}-${pad(date.day)}`
    }
  }
  return null
}

const HREF_PATTERN = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/i

/** Takes the value of the first `<a href="…">` from the raw HTML of a li. null when absent. */
function findHref(block: string): string | null {
  const match = HREF_PATTERN.exec(block)
  return match ? match[2] : null
}

/**
 * Makes href absolute with baseUrl. Entities in the attribute value (`?id=1&amp;p=2` etc.) are
 * resolved before the URL is built. null when resolving fails or it is not http(s).
 */
function resolveHttpUrl(href: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(decodeEntities(href), baseUrl)
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null
    return resolved.href
  } catch {
    return null
  }
}

/**
 * For each `<li>` element, takes the first `<a href>` and the first date notation and makes a
 * candidate. A li with no href, or one that cannot resolve to http(s), is dropped. The date is
 * the first date notation of the text, and the title is the text passed through stripTags
 * with that notation removed (up to 200 chars); when the text has no date notation, the date
 * is the first real calendar day written in the link and the whole text is the title. A li
 * with neither is dropped. summary is always null (a list page has no excerpt of the body).
 * When one link appears in several li (a menu, a banner and the list), the candidate with the
 * most text is kept, at the position of the first. When the input is longer than
 * MAX_INPUT_LENGTH the result is an empty array.
 */
export function parseHtmlList(html: string, baseUrl: string): NewsCandidate[] {
  if (html.length > MAX_INPUT_LENGTH) return []

  const byUrl = new Map<string, NewsCandidate>()

  // A linear scan (not `/<li\b[^>]*>([\s\S]*?)<\/li>/g`, which is O(n^2) on a page full of
  // unclosed `<li>`. See extractElementBlocks)
  for (const block of extractElementBlocks(removeInvisibleMarkup(html), 'li')) {
    const href = findHref(block)
    if (!href) continue
    const url = resolveHttpUrl(href, baseUrl)
    if (!url) continue

    const stripped = stripTags(block)
    const date = findDate(stripped)
    let publishedOn: string
    let title: string
    if (date) {
      publishedOn = date.publishedOn
      title = (stripped.slice(0, date.start) + stripped.slice(date.end)).replace(/\s+/g, ' ').trim()
    } else {
      const urlDate = findDateInUrl(url)
      if (!urlDate) continue
      publishedOn = urlDate
      title = stripped
    }

    const candidate = { url, title: truncate(title, TITLE_MAX), summary: null, publishedOn }
    const seen = byUrl.get(url)
    if (!seen || candidate.title.length > seen.title.length) byUrl.set(url, candidate)
  }

  return [...byUrl.values()]
}
