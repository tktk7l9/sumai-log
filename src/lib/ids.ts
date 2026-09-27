/**
 * An id is plain text in the DB; the only thing given meaning is its shape (36 UUID-like
 * characters). `crypto.randomUUID()` returns RFC 4122 v4, but the sha256-derived ids the seed
 * import script creates have the UUID shape without satisfying the v4 version/variant
 * nibbles. zod's `.uuid()` validates that strictly and would reject the imported existing
 * rows, so only the shape (8-4-4-4-12 hexadecimal) is checked.
 */
export const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function isIdLike(value: string): boolean {
  return UUID_SHAPE.test(value)
}
