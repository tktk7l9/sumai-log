/**
 * お知らせの本文（呼び出し側でタイトル＋要約を連結したもの）から、イベントの
 * 種別と日程を抜き出す（design.md §3）。種別語が一つも無い、または日付が一つも
 * 拾えなければイベントにしない（null）。
 *
 * 日付表現は投稿日の年を補って解決する（本文に明示の年が無ければ）。年をまたぐ
 * 判定は `inferYear` に切り出してある。
 */

export type EventKindLabel =
  '完成見学会' | '構造見学会' | '見学会' | '相談会' | 'セミナー' | 'イベント'

/** 種別語の優先順位。先に一致したものを採用する（「見学会」は「完成見学会」等の部分文字列でもあるため順序が要る）。 */
function detectKind(text: string): EventKindLabel | null {
  if (text.includes('完成見学会')) return '完成見学会'
  if (text.includes('構造見学会')) return '構造見学会'
  if (text.includes('見学会') || text.includes('オープンハウス')) return '見学会'
  if (text.includes('相談会')) return '相談会'
  if (text.includes('セミナー')) return 'セミナー'
  if (text.includes('イベント')) return 'イベント'
  return null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 日付の月から、投稿日（`publishedOn` = 'YYYY-MM-DD'）を基準にした年を推定する。
 * 投稿月より **2 か月以上前**（`month < 投稿月 - 1`）の月は翌年の出来事とみなす。
 * それ以外（投稿月の1か月前まで・同月・後の月）は投稿日と同じ年。
 */
export function inferYear(month: number, publishedOn: string): number {
  const postYear = Number(publishedOn.slice(0, 4))
  const postMonth = Number(publishedOn.slice(5, 7))
  return month < postMonth - 1 ? postYear + 1 : postYear
}

type FoundDate = { year: number; month: number; day: number }

function toIso(date: FoundDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`
}

// 「YYYY年」は任意。「M月D日」は必須（曜日・祝の注記 `(土)` 等は無視して構わない。
// 数字を含まないので後続の走査に影響しない）。
const KANJI_DATE = /(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/g
// 「M月D日」の一部ではない、独立した「D日」（列挙・範囲の続き: `・18日` `〜23日` 等）。
const BARE_DAY = /(\d{1,2})日/g

/**
 * 「M月D日」（明示年つきも可）と、それに続く「D日」の列挙・範囲
 * （`・18日` `〜23日(月祝)` 等、曜日・祝の注記は無視）を拾う。
 * 独立した「D日」は直前の「M月D日」と同じ月・年とみなし、直前が無ければ捨てる。
 */
function findKanjiDates(text: string, publishedOn: string): FoundDate[] {
  const dates: FoundDate[] = []
  const spans: { start: number; end: number; year: number; month: number }[] = []

  for (const match of text.matchAll(KANJI_DATE)) {
    // matchAll の一致は必ず index を持つ（型定義上は optional なだけ）
    const start = match.index as number
    const month = Number(match[2])
    const year = match[1] !== undefined ? Number(match[1]) : inferYear(month, publishedOn)
    spans.push({ start, end: start + match[0].length, year, month })
    dates.push({ year, month, day: Number(match[3]) })
  }

  for (const match of text.matchAll(BARE_DAY)) {
    const start = match.index as number
    // 既に KANJI_DATE で拾った「M月D日」の日部分なら二重カウントしない
    if (spans.some((span) => start >= span.start && start < span.end)) continue

    // 同じ月とみなす直前の「M月D日」（無ければこの「D日」は手がかりが無いので捨てる）
    const governing = [...spans].reverse().find((span) => span.start < start)
    if (!governing) continue

    dates.push({ year: governing.year, month: governing.month, day: Number(match[1]) })
  }

  return dates
}

// 「M/D」に続けて、同月終端（`-/D` `～D`）か別月まで（`-M/D` `〜M/D`）の範囲を任意で許す。
const SLASH_RANGE =
  /(\d{1,2})\/(\d{1,2})(?:[-〜～](?:(\d{1,2})\/(\d{1,2})|\/(\d{1,2})|(\d{1,2})))?/g

/** 「M/D」「M/D-/D」「M/D-M/D」「M/D〜M/D」「M/D～D」を拾う。 */
function findSlashDates(text: string, publishedOn: string): FoundDate[] {
  const dates: FoundDate[] = []

  for (const match of text.matchAll(SLASH_RANGE)) {
    const startMonth = Number(match[1])
    dates.push({
      year: inferYear(startMonth, publishedOn),
      month: startMonth,
      day: Number(match[2]),
    })

    if (match[3] !== undefined) {
      // M/D-M/D（月をまたぐこともある終端）
      const endMonth = Number(match[3])
      dates.push({ year: inferYear(endMonth, publishedOn), month: endMonth, day: Number(match[4]) })
    } else if (match[5] !== undefined) {
      // M/D-/D（同月終端）
      dates.push({
        year: inferYear(startMonth, publishedOn),
        month: startMonth,
        day: Number(match[5]),
      })
    } else if (match[6] !== undefined) {
      // M/D～D（同月終端）
      dates.push({
        year: inferYear(startMonth, publishedOn),
        month: startMonth,
        day: Number(match[6]),
      })
    }
  }

  return dates
}

/**
 * タイトル＋要約（呼び出し側で連結した `text`）からイベントの種別と日程を抜く。
 * 種別語（完成見学会 / 構造見学会 / 見学会（お住まい見学会・オープンハウスを含む）/
 * 相談会 / セミナー / イベント）が一つも無ければ null。日付表現が一つも
 * 拾えなければ null。複数の日が見つかれば最小を start・最大を end にする
 * （1 つなら両方同じ）。
 */
export function extractEvent(
  text: string,
  publishedOn: string,
): { start: string; end: string; kind: EventKindLabel } | null {
  const kind = detectKind(text)
  if (!kind) return null

  const dates = [...findKanjiDates(text, publishedOn), ...findSlashDates(text, publishedOn)]
  if (dates.length === 0) return null

  const isoDates = dates.map(toIso)
  const start = isoDates.reduce((a, b) => (a < b ? a : b))
  const end = isoDates.reduce((a, b) => (a > b ? a : b))

  return { start, end, kind }
}
