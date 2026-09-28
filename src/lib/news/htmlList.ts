/**
 * For vendors without RSS: turns the `<ul><li>` list of a news page into candidates
 * (assumes a plain list of only "YYYY年M月D日" + title + relative link, like the builder
 * without RSS in design.md §1). No external HTML parser is used; extraction is done with
 * regular expressions only.
 */

import type { NewsCandidate } from './rss'
import { decodeEntities, MAX_INPUT_LENGTH, pad, stripTags, truncate } from './text'

const TITLE_MAX = 200

const LI_PATTERN = /<li\b[^>]*>([\s\S]*?)<\/li>/gi

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
 * candidate. A li with no href, one that cannot resolve to http(s), or no date notation is
 * dropped. The title is the text passed through stripTags with the date notation removed (up
 * to 200 chars). summary is always null (a list page has no excerpt of the body). When the
 * input is longer than MAX_INPUT_LENGTH the result is an empty array.
 */
export function parseHtmlList(html: string, baseUrl: string): NewsCandidate[] {
  if (html.length > MAX_INPUT_LENGTH) return []

  const candidates: NewsCandidate[] = []

  for (const liMatch of html.matchAll(LI_PATTERN)) {
    const block = liMatch[1]

    const href = findHref(block)
    if (!href) continue
    const url = resolveHttpUrl(href, baseUrl)
    if (!url) continue

    const stripped = stripTags(block)
    const date = findDate(stripped)
    if (!date) continue

    const withoutDate = (stripped.slice(0, date.start) + stripped.slice(date.end))
      .replace(/\s+/g, ' ')
      .trim()

    candidates.push({
      url,
      title: truncate(withoutDate, TITLE_MAX),
      summary: null,
      publishedOn: date.publishedOn,
    })
  }

  return candidates
}
