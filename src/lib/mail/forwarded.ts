/**
 * Gmail の「転送」が本文の先頭に付けるブロックを解析する（設計 2026-09-19 §3-3 手動転送）。
 *
 *   ---------- Forwarded message ---------   （日本語 UI: ---------- 転送メッセージ ---------）
 *   From: 名前 <addr>                         （差出人:）
 *   Date: ...                                 （日付:）
 *   Subject: ...                              （件名:）
 *   To: ...                                   （宛先: / To:）
 *   <空行>
 *   本文
 *
 * ブロックより上（転送した人のコメント）は捨てる。
 */

export type ForwardedBlock = {
  from: string | null
  /** YYYY-MM-DD。読めなければ null */
  date: string | null
  subject: string | null
  body: string
}

const MARKER = /^-{3,}\s*(Forwarded message|転送メッセージ)\s*-{3,}\s*$/m
const HEADER_LINE = /^(From|差出人|Date|日付|Subject|件名|To|宛先|Cc):\s*(.*)$/

const ADDRESS_IN_BRACKETS = /<([^<>]+)>/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** '2026年9月16日(火) 10:05' / 'Tue, Sep 16, 2026 at 10:05 AM' → '2026-09-16' */
export function parseForwardedDate(raw: string): string | null {
  const ja = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(raw)
  if (ja) return `${ja[1]}-${pad(Number(ja[2]))}-${pad(Number(ja[3]))}`
  const ms = Date.parse(raw.replace(/\s+at\s+/, ' '))
  if (Number.isNaN(ms)) return null
  // 表記に時差が無いので、ローカル時刻として解釈した日付をそのまま使う
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function splitForwardedBlock(text: string): ForwardedBlock | null {
  const m = MARKER.exec(text)
  if (!m) return null
  const after = text.slice(m.index + m[0].length).replace(/^\r?\n/, '')
  const lines = after.split(/\r?\n/)

  let from: string | null = null
  let date: string | null = null
  let subject: string | null = null
  let i = 0
  for (; i < lines.length; i++) {
    const h = HEADER_LINE.exec(lines[i])
    if (!h) break
    const key = h[1]
    const value = h[2].trim()
    if (key === 'From' || key === '差出人') {
      const addr = ADDRESS_IN_BRACKETS.exec(value)
      from = (addr ? addr[1] : value).trim().toLowerCase() || null
    } else if (key === 'Date' || key === '日付') {
      date = parseForwardedDate(value)
    } else if (key === 'Subject' || key === '件名') {
      subject = value || null
    }
  }
  const body = lines.slice(i).join('\n').trim()
  return { from, date, subject, body }
}
