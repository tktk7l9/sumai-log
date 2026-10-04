/** 75 -> '1:15', 3725 -> '1:02:05'. The way YouTube writes a length */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** 12345 -> '1.2万回', 980 -> '980回' */
export function formatViews(views: number): string {
  if (views < 10_000) return `${views}回`
  return `${Number((views / 10_000).toFixed(1))}万回`
}
