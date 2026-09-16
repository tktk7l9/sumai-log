/**
 * 業者のお知らせフィード（RSS 2.0）を候補に変換する。design.md §1 の方針どおり
 * 外部 XML パーサは使わず、正規表現だけで `<item>` を拾う。壊れた XML や
 * 想定外の入力でも例外は投げず、読めなかった item を静かに落として続ける。
 */

import { toJstDateKey } from '../jst'
import { decodeEntities, stripTags, truncate } from './text'

export type NewsCandidate = {
  url: string
  title: string
  summary: string | null
  publishedOn: string
}

const SUMMARY_MAX = 300

const ITEM_PATTERN = /<item\b[^>]*>([\s\S]*?)<\/item>/gi

/** item のブロックから要素の中身（生テキスト）を取り出す。無ければ null。 */
function extractElementRaw(block: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const match = pattern.exec(block)
  return match ? match[1] : null
}

const CDATA_PATTERN = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/

/** `<![CDATA[...]]>` で包まれていれば中身を取り出す。包まれていなければそのまま。 */
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

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** RFC 2822 の pubDate（`+0900` / `GMT` などのオフセット）を JST の 'YYYY-MM-DD' に直す。読めなければ null。 */
function pubDateToJstDateKey(raw: string): string | null {
  const match = PUB_DATE_PATTERN.exec(raw.trim())
  if (!match) return null

  const [, day, monthName, year, hour, minute, second, offset] = match
  const month = MONTHS[monthName.toLowerCase()]
  const offsetIso =
    offset.toUpperCase() === 'GMT' ? '+00:00' : `${offset.slice(0, 3)}:${offset.slice(3)}`
  const iso = `${year}-${pad(month)}-${pad(Number(day))}T${hour}:${minute}:${second}${offsetIso}`
  return toJstDateKey(iso)
}

/**
 * RSS 2.0 の XML から `<item>` ごとに候補を作る。`link` が `http(s)` でない・
 * `link`/`pubDate` が読めない item は落とす。`title`/`description` が無くても
 * item 自体は残す（title は空文字・summary は null）。壊れた XML は
 * `<item>` が一つも見つからず自然に空配列になる（例外は投げない）。
 */
export function parseRss(xml: string): NewsCandidate[] {
  const candidates: NewsCandidate[] = []

  for (const itemMatch of xml.matchAll(ITEM_PATTERN)) {
    const block = itemMatch[1]

    const rawLink = extractElementRaw(block, 'link')
    if (!rawLink) continue
    const url = decodeEntities(unwrapCdata(rawLink)).trim()
    if (!HTTP_URL.test(url)) continue

    const rawPubDate = extractElementRaw(block, 'pubDate')
    if (!rawPubDate) continue
    const publishedOn = pubDateToJstDateKey(decodeEntities(unwrapCdata(rawPubDate)))
    if (!publishedOn) continue

    const rawTitle = extractElementRaw(block, 'title')
    const title = rawTitle ? decodeEntities(unwrapCdata(rawTitle)).trim() : ''

    const rawDescription = extractElementRaw(block, 'description')
    const summary = rawDescription
      ? truncate(stripTags(unwrapCdata(rawDescription)), SUMMARY_MAX)
      : null

    candidates.push({ url, title, summary, publishedOn })
  }

  return candidates
}
