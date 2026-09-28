/**
 * Normalisation used at the form input boundary. When the field is emptied, Mantine's
 * NumberInput emits an empty string `''` instead of a number, but the DB column is a
 * nullable number, so convert to null here before passing to the zod schema (otherwise
 * saving fails).
 */
export function emptyToNull<T>(value: T | ''): T | null {
  return value === '' ? null : value
}
