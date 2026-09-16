/**
 * RSS が無い業者向け：お知らせページの `<ul><li>` 一覧を候補に変換する
 * （design.md §1 の RSS の無い工務店のように「YYYY年M月D日」＋タイトル＋相対リンクだけの
 * 素朴な一覧を想定）。外部 HTML パーサは使わず正規表現だけで抜く。
 */

import type { NewsCandidate } from './rss'
import { decodeEntities, MAX_INPUT_LENGTH, pad, stripTags, truncate } from './text'

const TITLE_MAX = 200

const LI_PATTERN = /<li\b[^>]*>([\s\S]*?)<\/li>/gi

// 「YYYY年M月D日」「YYYY.MM.DD」「YYYY/M/D」のいずれか。leftmost の一致を採る。
const DATE_PATTERN =
  /(\d{4})年(\d{1,2})月(\d{1,2})日|(\d{4})\.(\d{1,2})\.(\d{1,2})|(\d{4})\/(\d{1,2})\/(\d{1,2})/

type DateMatch = { start: number; end: number; publishedOn: string }

/** stripTags 済みのテキストから最初の日付表記を探す。無ければ null。 */
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

/** li の生 HTML から最初の `<a href="…">` の値を取り出す。無ければ null。 */
function findHref(block: string): string | null {
  const match = HREF_PATTERN.exec(block)
  return match ? match[2] : null
}

/**
 * href を baseUrl で絶対化する。属性値中のエンティティ（`?id=1&amp;p=2` 等）を
 * 解決してから URL を組み立てる。解決に失敗する・http(s) 以外なら null。
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
 * `<li>` 要素ごとに、最初の `<a href>` と最初の日付表記を取り出して候補にする。
 * href が無い・http(s) に解決できない・日付表記が無い li は捨てる。
 * タイトルは stripTags 済みのテキストから日付表記を取り除いたもの（200 字まで）。
 * summary は常に null（一覧ページに本文の抜粋は無いため）。入力が
 * MAX_INPUT_LENGTH を超える場合は空配列。
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
