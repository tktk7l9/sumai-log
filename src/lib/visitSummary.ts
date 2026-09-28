/**
 * What a visit is about, for its card and detail heading (SHIG 24, 28: the view shows the
 * object, not only the date). `title` is the place (or vendor / property), `subject` the
 * vendor or property behind that place when it differs, and `excerpt` the first line of
 * 「良かった点」 (good points).
 */
export function visitSummary(v: {
  placeName: string | null
  vendorName: string | null
  propertyName: string | null
  good: string | null
}): { title: string; subject: string | null; excerpt: string | null } {
  const title = v.placeName ?? v.vendorName ?? v.propertyName ?? '場所未設定'
  const subject = v.placeName ? (v.vendorName ?? v.propertyName) : null
  const excerpt =
    (v.good ?? '')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '') ?? null
  return { title, subject, excerpt }
}
