/**
 * Display formatters for candidates (vendors, properties). Amounts arrive as integer yen and
 * are shown rounded to units of 10,000 yen
 */

export function formatYen(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  if (Math.abs(value) < 10_000) return `${value.toLocaleString('ja-JP')}円`
  return `${Math.round(value / 10_000).toLocaleString('ja-JP')}万円`
}

export function formatSqm(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(2)}㎡`
}

export function formatTsubo(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (min != null && max != null) return `${min}〜${max}万円/坪`
  if (min != null) return `${min}万円/坪〜`
  if (max != null) return `〜${max}万円/坪`
  return '—'
}
