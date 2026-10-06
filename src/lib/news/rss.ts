/**
 * Turns a vendor news feed (RSS 2.0) into candidates. Following the policy of design.md §1, no
 * external XML parser is used and `<item>` is picked up with regular expressions only. Broken
 * XML or unexpected input does not throw; items that could not be read are dropped silently
 * and processing continues.
 */

import { parseToUtcMs, toJstDateKey } from '../jst'
import {
  decodeEntities,
  extractElementBlocks,
  MAX_INPUT_LENGTH,
  pad,
  stripTags,
  truncate,
} from './text'

export type NewsCandidate = {
  url: string
  title: string
  summary: string | null
  publishedOn: string
}

const TITLE_MAX = 200
const SUMMARY_MAX = 300

/**
 * Takes the contents (raw text) of the first `<tag>` element in an item block. null when
 * absent. A linear scan, not a regex: a block stuffed with unclosed `<link>` would otherwise
 * be O(n^2) (see extractElementBlocks).
 */
function extractElementRaw(block: string, tag: string): string | null {
  return extractElementBlocks(block, tag, 1)[0] ?? null
}

const CDATA_PATTERN = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/

/** Takes the contents when wrapped in `<![CDATA[...]]>`. Returned as is when not wrapped. */
function unwrapCdata(raw: string): string {
  const match = CDATA_PATTERN.exec(raw)
  return match ? match[1] : raw
}

const HTTP_URL = /^https?:\/\//i

// RFC 2822: "Sat, 12 Sep 2026 09:00:00 +0900" / "Wed, 01 Jan 2026 00:00:00 GMT"
const PUB_DATE_PATTERN =
  /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+(GMT|[+-]\d{4})$/i

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

const RESULT_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Converts an RFC 2822 pubDate (offsets such as `+0900` / `GMT`) into a JST 'YYYY-MM-DD'.
 * null when it cannot be read, the day is outside 1-31, or the final result is not in the
 * `YYYY-MM-DD` form.
 *
 * `Date.parse` sometimes does not turn a non-existent day such as 2/31 into NaN but resolves
 * it by "rolling over to the next month" (e.g. `2026-02-31` -> `2026-03-03`). So the month at
 * the UTC instant from `parseToUtcMs` is compared with the month of the input before parsing,
 * and when they differ a rollover is assumed and the item is dropped (the date / month
 * changing in the conversion to JST is normal behavior, so the comparison is made before
 * that conversion, at the UTC instant).
 */
function pubDateToJstDateKey(raw: string): string | null {
  const match = PUB_DATE_PATTERN.exec(raw.trim())
  if (!match) return null

  const [, day, monthName, year, hour, minute, second, offset] = match
  const dayNum = Number(day)
  if (dayNum < 1 || dayNum > 31) return null

  const month = MONTHS[monthName.toLowerCase()]
  const offsetIso =
    offset.toUpperCase() === 'GMT' ? '+00:00' : `${offset.slice(0, 3)}:${offset.slice(3)}`
  const iso = `${year}-${pad(month)}-${pad(dayNum)}T${hour}:${minute}:${second}${offsetIso}`

  const utcMs = parseToUtcMs(iso)
  if (utcMs === null) return null
  if (new Date(utcMs).getUTCMonth() + 1 !== month) return null

  const key = toJstDateKey(iso)
  return RESULT_KEY_PATTERN.test(key) ? key : null
}

/**
 * Builds a candidate for each `<item>` of RSS 2.0 XML. An item is dropped when `link` is not
 * `http(s)`, `link`/`pubDate` cannot be read, or `title` is empty (no element, or only
 * whitespace inside). Without `description` the item itself is kept (summary is null).
 * Broken XML has no `<item>` to find and naturally gives an empty array (does not throw).
 * Input longer than MAX_INPUT_LENGTH also gives an empty array.
 */
export function parseRss(xml: string): NewsCandidate[] {
  if (xml.length > MAX_INPUT_LENGTH) return []

  const candidates: NewsCandidate[] = []

  // A linear scan (not `/<item\b[^>]*>([\s\S]*?)<\/item>/g`, which is O(n^2) on a feed
  // full of unclosed `<item>`. See extractElementBlocks)
  for (const block of extractElementBlocks(xml, 'item')) {
    const rawLink = extractElementRaw(block, 'link')
    if (!rawLink) continue
    const url = decodeEntities(unwrapCdata(rawLink)).trim()
    if (!HTTP_URL.test(url)) continue

    const rawPubDate = extractElementRaw(block, 'pubDate')
    if (!rawPubDate) continue
    const publishedOn = pubDateToJstDateKey(decodeEntities(unwrapCdata(rawPubDate)))
    if (!publishedOn) continue

    const rawTitle = extractElementRaw(block, 'title')
    const title = rawTitle ? truncate(decodeEntities(unwrapCdata(rawTitle)).trim(), TITLE_MAX) : ''
    if (!title) continue

    const rawDescription = extractElementRaw(block, 'description')
    const summary = rawDescription
      ? truncate(stripTags(unwrapCdata(rawDescription)), SUMMARY_MAX)
      : null

    candidates.push({ url, title, summary, publishedOn })
  }

  return candidates
}
