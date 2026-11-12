/**
 * Turns a vendor news feed into candidates: RSS 2.0 (`<item>`, `<pubDate>`), RSS 1.0 / RDF
 * (`<item>`, `<dc:date>`) and Atom (`<entry>`, `<published>` / `<updated>`, `<link href>`).
 * Following the policy of design.md §1, no external XML parser is used and the elements are
 * picked up with linear scans only. Broken XML or unexpected input does not throw; items that
 * could not be read are dropped silently and processing continues.
 */

import { parseToUtcMs, toJstDateKey } from '../jst'
import { isRealDate } from './eventDate'
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
 * null when it cannot be read, the written day is not on the calendar, or the final result is
 * not in the `YYYY-MM-DD` form.
 *
 * `Date.parse` sometimes does not turn a non-existent day such as 2/31 into NaN but resolves
 * it by "rolling over to the next month" (e.g. `2026-02-31` -> `2026-03-03`), so the written
 * year, month and day are checked against the calendar before parsing. (Comparing the month
 * of the parsed instant in UTC with the written month, as this did before, also dropped every
 * real date whose UTC month differs from the written one: 08:00 on the 1st at `+0900`.)
 */
function pubDateToJstDateKey(raw: string): string | null {
  const match = PUB_DATE_PATTERN.exec(raw.trim())
  if (!match) return null

  const [, day, monthName, year, hour, minute, second, offset] = match
  const dayNum = Number(day)
  const month = MONTHS[monthName.toLowerCase()]
  if (!isRealDate({ year: Number(year), month, day: dayNum })) return null

  const offsetIso =
    offset.toUpperCase() === 'GMT' ? '+00:00' : `${offset.slice(0, 3)}:${offset.slice(3)}`
  return instantToJstDateKey(
    `${year}-${pad(month)}-${pad(dayNum)}T${hour}:${minute}:${second}${offsetIso}`,
  )
}

/** The JST date of an ISO 8601 instant. null when it cannot be read or is not `YYYY-MM-DD` */
function instantToJstDateKey(iso: string): string | null {
  if (parseToUtcMs(iso) === null) return null
  const key = toJstDateKey(iso)
  return RESULT_KEY_PATTERN.test(key) ? key : null
}

// W3CDTF, as Atom and Dublin Core write it: a date alone, or a date and a time whose seconds
// may be left out
const ISO_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2})(:\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/i

/**
 * Converts the date of an Atom entry or `<dc:date>` into a JST 'YYYY-MM-DD'. A date alone is
 * taken as written (it names a day, not an instant). null when it cannot be read or the
 * written day is not on the calendar.
 */
function isoDateToJstDateKey(raw: string): string | null {
  const match = ISO_DATE_PATTERN.exec(raw.trim())
  if (!match) return null

  const [, year, month, day, time, seconds, offset] = match
  if (!isRealDate({ year: Number(year), month: Number(month), day: Number(day) })) return null
  if (time === undefined) return `${year}-${month}-${day}`
  return instantToJstDateKey(
    `${year}-${month}-${day}T${time}${seconds ?? ':00'}${offset.toUpperCase()}`,
  )
}

/** The elements that carry the date of an item, in the order they are tried */
const ISO_DATE_TAGS = ['dc:date', 'published', 'updated']

function publishedOnOf(block: string): string | null {
  const rawPubDate = extractElementRaw(block, 'pubDate')
  if (rawPubDate) return pubDateToJstDateKey(decodeEntities(unwrapCdata(rawPubDate)))
  for (const tag of ISO_DATE_TAGS) {
    const raw = extractElementRaw(block, tag)
    const key = raw ? isoDateToJstDateKey(decodeEntities(unwrapCdata(raw))) : null
    if (key) return key
  }
  return null
}

const HREF_ATTRIBUTE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i
const REL_ATTRIBUTE = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)')/i

/**
 * The page an Atom entry points at: the `href` of the first `<link>` that is the entry itself
 * (`rel="alternate"`, or no `rel`, which means the same). `self`, `edit`, `enclosure` etc. are
 * not the page. One linear scan with `indexOf` (see extractElementBlocks): each `<link` is
 * read up to its `>`, and a `<link` with no `>` after it ends the scan.
 */
function atomLinkHref(block: string): string | null {
  const lower = block.toLowerCase()
  let i = 0
  for (;;) {
    const lt = lower.indexOf('<link', i)
    if (lt === -1) return null
    const gt = block.indexOf('>', lt)
    if (gt === -1) return null
    i = gt + 1
    // `<linkage …>` is a different tag
    if (/[A-Za-z0-9_:-]/.test(block[lt + 5])) continue
    const tag = block.slice(lt, gt)
    const rel = REL_ATTRIBUTE.exec(tag)
    if (rel && (rel[1] ?? rel[2]).trim().toLowerCase() !== 'alternate') continue
    const href = HREF_ATTRIBUTE.exec(tag)
    if (href) return href[1] ?? href[2]
  }
}

/** The link of an item: the text of `<link>` (RSS), or the href of the entry's page (Atom) */
function linkOf(block: string): string | null {
  const rawLink = extractElementRaw(block, 'link')
  const url = decodeEntities(rawLink ? unwrapCdata(rawLink) : (atomLinkHref(block) ?? '')).trim()
  return HTTP_URL.test(url) ? url : null
}

/** The elements that carry the body of an item, in the order they are tried */
const DESCRIPTION_TAGS = ['description', 'summary', 'content']

function summaryOf(block: string): string | null {
  for (const tag of DESCRIPTION_TAGS) {
    const raw = extractElementRaw(block, tag)
    if (raw) return truncate(stripTags(unwrapCdata(raw)), SUMMARY_MAX)
  }
  return null
}

/**
 * Builds a candidate for each `<item>` (RSS) or, in a feed without any, each `<entry>` (Atom).
 * An item is dropped when its link is not `http(s)`, the link or the date cannot be read, or
 * `title` is empty (no element, or only whitespace inside). Without a description the item
 * itself is kept (summary is null).
 * Broken XML has no `<item>` to find and naturally gives an empty array (does not throw).
 * Input longer than MAX_INPUT_LENGTH also gives an empty array.
 */
export function parseRss(xml: string): NewsCandidate[] {
  if (xml.length > MAX_INPUT_LENGTH) return []

  const candidates: NewsCandidate[] = []

  // A linear scan (not `/<item\b[^>]*>([\s\S]*?)<\/item>/g`, which is O(n^2) on a feed
  // full of unclosed `<item>`. See extractElementBlocks)
  const items = extractElementBlocks(xml, 'item')
  for (const block of items.length > 0 ? items : extractElementBlocks(xml, 'entry')) {
    const url = linkOf(block)
    if (!url) continue

    const publishedOn = publishedOnOf(block)
    if (!publishedOn) continue

    const rawTitle = extractElementRaw(block, 'title')
    const title = rawTitle ? truncate(decodeEntities(unwrapCdata(rawTitle)).trim(), TITLE_MAX) : ''
    if (!title) continue

    candidates.push({ url, title, summary: summaryOf(block), publishedOn })
  }

  return candidates
}
