/**
 * 見学記録の「次にやること」をチェックリストとして扱う（純粋関数）。保存形式は今までどおり
 * 1 行 1 項目のテキストで、済んだ行は先頭に「済 」を付ける（分析ページもこの印で数える）。
 */

/** 済んだ行の印。「済」「完了」「✓」「✔」「[x]」で始まる行を済みとみなす */
export const DONE_PREFIX = /^(済|完了|✓|✔|\[x\])\s*/iu

/** 行頭の箇条書きの印（「・」「-」「*」「□」「1.」など） */
const BULLET = /^([・\-*□☐]|\d+[.)．])\s*/u

export type ActionItem = {
  /** 元のテキストの何行目か */
  line: number
  text: string
  done: boolean
}

/** テキストを項目に分ける。空行と、印だけで中身の無い行は項目にしない */
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

/** 指定の行の済／未済を切り替えた新しいテキスト。済にするときは「済 」を付け、戻すときは外す */
export function toggleAction(text: string, line: number): string {
  const lines = text.split(/\r?\n/u)
  const raw = lines[line]
  if (raw === undefined) return text
  const trimmed = raw.trim()
  lines[line] = DONE_PREFIX.test(trimmed) ? trimmed.replace(DONE_PREFIX, '') : `済 ${trimmed}`
  return lines.join('\n')
}

/** 末尾に項目を足した新しいテキスト。空の項目は足さない */
export function appendAction(text: string | null | undefined, item: string): string {
  const body = item.trim()
  const base = (text ?? '').replace(/\s+$/u, '')
  if (body === '') return base
  return base === '' ? body : `${base}\n${body}`
}
