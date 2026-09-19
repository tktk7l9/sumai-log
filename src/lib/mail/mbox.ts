/**
 * mbox（Gmail Takeout の書き出し形式）を 1 通ずつに分ける。純粋関数。
 * 区切りは行頭の "From "（mboxrd: 本文中の "From " は ">From " にエスケープされているので戻す）。
 */
const SEPARATOR = /^From .*$/m

export function splitMbox(text: string): string[] {
  const out: string[] = []
  let rest = text
  let m = SEPARATOR.exec(rest)
  if (!m) return out
  rest = rest.slice(m.index)
  const parts = rest.split(/^From .*\r?\n/m).filter((p) => p.length > 0)
  for (const part of parts) {
    const unescaped = part.replace(/^>From /gm, 'From ').replace(/\r?\n+$/, '')
    if (unescaped.trim().length > 0) out.push(unescaped)
  }
  return out
}
