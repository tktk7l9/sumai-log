/**
 * 日付入力の読み取り。
 *
 * 台帳に入る形は 'YYYY-MM-DD' のひと通りだが、書き写す元（登記簿・通知書・
 * 名刺・メール）の表記はまちまちで、打つ人が毎回そこに気を遣うのは無駄。
 * よくある書き方を受けて、保存する形に直す。
 */

const PATTERNS: readonly RegExp[] = [
  // 2026-07-30 / 2026-7-30
  /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  // 2026/07/30 / 2026.7.30
  /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/,
  // 20260730
  /^(\d{4})(\d{2})(\d{2})$/,
  // 2026年7月30日
  /^(\d{4})年(\d{1,2})月(\d{1,2})日?$/,
]

/** 実在する日付か。2026-02-30 のような繰り上がる値を弾く。 */
function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/**
 * 打たれた文字列を 'YYYY-MM-DD' に直す。読めなければ null。
 *
 * 「7/30」のように年が無いものは受けない。今年だと決めつけると、
 * 過去の記録を写しているときに黙って違う年で保存されてしまう。
 */
export function parseDateInput(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  for (const pattern of PATTERNS) {
    const match = pattern.exec(trimmed)
    if (!match) continue

    const [, rawYear, rawMonth, rawDay] = match
    const year = Number(rawYear)
    const month = Number(rawMonth)
    const day = Number(rawDay)
    if (!isRealDate(year, month, day)) return null

    return `${rawYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return null
}
