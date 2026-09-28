/**
 * The title of an event can be left empty: most events are "<vendor> 見学/打合せ" (visit /
 * meeting), so it is derived from what was already chosen (SHIG 14 pre-computation, 50 do not
 * demand exactness). What the user types always wins.
 */
export function suggestEventTitle(input: {
  kindLabel: string
  vendorName?: string | null
  propertyName?: string | null
  placeName?: string | null
}): string {
  const who = input.vendorName ?? input.propertyName ?? input.placeName
  if (!who) return ''
  return input.kindLabel === 'その他' ? who : `${who} ${input.kindLabel}`
}

export function resolveEventTitle(typed: string, suggestion: string): string {
  return typed.trim() || suggestion
}
