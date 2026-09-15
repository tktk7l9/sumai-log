/** 候補（業者・物件）の表示用フォーマッタ。金額は円の整数で受け取り、万円単位に丸めて表示する */

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
