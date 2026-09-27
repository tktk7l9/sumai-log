/**
 * Reading date input.
 *
 * The ledger stores only one form, 'YYYY-MM-DD', but the sources being copied (land
 * registry, notices, business cards, mail) vary in notation, and making the typist mind
 * that every time is a waste. Accept the common notations and convert to the stored form.
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

/** Whether the date exists. Rejects values that roll over, such as 2026-02-30. */
function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/**
 * Converts the typed string to 'YYYY-MM-DD'. Returns null when unreadable.
 *
 * Values without a year, such as "7/30", are rejected. Assuming this year would
 * silently save the wrong year while copying past records.
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
