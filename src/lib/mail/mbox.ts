/**
 * Splits an mbox (the Gmail Takeout export format) into single messages. Pure function.
 * The separator is "From " at the start of a line (mboxrd: a "From " in the body is escaped as
 * ">From ", so it is restored).
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
