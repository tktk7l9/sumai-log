/**
 * Handles "次にやること" (Next actions) of a visit record as a checklist (pure functions). The
 * stored format is unchanged: text with 1 item per line, and a done line gets "済 " (done) at
 * its head (the analysis page also counts by this mark).
 */

/**
 * Mark of a done line. A line starting with "済", "済み", "完了", "✓", "✔" or "[x]" is taken
 * as done. The word marks need a space or a colon after them (or to be the whole line): the
 * app itself writes "済 ", and "完了検査の立会い" or "済んでいない書類" is an ordinary item
 * (it used to show as ticked, and unticking it deleted those characters from the record).
 */
export const DONE_PREFIX = /^(?:(?:済み?|完了)(?:[\s:：]+|$)|(?:✓|✔|\[x\])\s*)/iu

/**
 * Bullet mark at the head of a line ("・", "-", "*", "□", "1." etc.). A number is a bullet
 * only when no digit follows its mark ("10.5畳" and "2026.11.20" are not)
 */
const BULLET = /^([・\-*□☐]|\d+[.)．](?!\d))\s*/u

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
