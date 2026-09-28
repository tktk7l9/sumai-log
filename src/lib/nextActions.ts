/**
 * Handles "次にやること" (Next actions) of a visit record as a checklist (pure functions). The
 * stored format is unchanged: text with 1 item per line, and a done line gets "済 " (done) at
 * its head (the analysis page also counts by this mark).
 */

/** Mark of a done line. A line starting with "済", "完了", "✓", "✔" or "[x]" is taken as done */
export const DONE_PREFIX = /^(済|完了|✓|✔|\[x\])\s*/iu

/** Bullet mark at the head of a line ("・", "-", "*", "□", "1." etc.) */
const BULLET = /^([・\-*□☐]|\d+[.)．])\s*/u

export type ActionItem = {
  /** Line number in the original text */
  line: number
  text: string
  done: boolean
}

/** Splits text into items. Empty lines, and lines with only a mark and no content, are skipped */
export function parseActions(text: string | null | undefined): ActionItem[] {
  return (text ?? '')
    .split(/\r?\n/u)
    .map((raw, line) => {
      const trimmed = raw.trim()
      const done = DONE_PREFIX.test(trimmed)
      const body = trimmed.replace(DONE_PREFIX, '').replace(BULLET, '').trim()
      return { line, text: body, done }
    })
    .filter((a) => a.text !== '')
}

/**
 * New text with done / not done toggled for the given line. Adds "済 " when marking done and
 * removes it when reverting
 */
export function toggleAction(text: string, line: number): string {
  const lines = text.split(/\r?\n/u)
  const raw = lines[line]
  if (raw === undefined) return text
  const trimmed = raw.trim()
  lines[line] = DONE_PREFIX.test(trimmed) ? trimmed.replace(DONE_PREFIX, '') : `済 ${trimmed}`
  return lines.join('\n')
}

/** New text with the item appended at the end. An empty item is not appended */
export function appendAction(text: string | null | undefined, item: string): string {
  const body = item.trim()
  const base = (text ?? '').replace(/\s+$/u, '')
  if (body === '') return base
  return base === '' ? body : `${base}\n${body}`
}
