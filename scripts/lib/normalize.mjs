/**
 * Normalization functions (address, SNS URL) extracted from seed.mjs.
 *
 * Both must keep the same behavior as the src/lib/ side (normalizeAddress in geocode.ts,
 * normalizeSocialUrls in social.ts). Never change only one side
 * (the seed side is plain `.mjs` and cannot import TS, so the duplication is deliberate.
 * See the AGENTS.md section on keeping duplicated logic in sync and
 * src/lib/normalize-parity.test.ts).
 */

/**
 * Normalize an address so that it does not vary before and after sending it to the
 * GSI (Geospatial Information Authority of Japan) API.
 * - Use NFKC to fold full-width alphanumerics and full-width symbols to half-width
 * - Remove whitespace (including full-width)
 * - Unify dash-like characters to the half-width hyphen
 * - "N丁目M番K号" -> "N-M-K", "N丁目M番地" -> "N-M"
 *
 * This normalized string is also used as the key of geocode_cache.query.
 *
 * Keep identical to normalizeAddress in src/lib/geocode.ts (otherwise the geocode_cache
 * keys stop matching).
 * Only null/undefined are returned as is (the app side guarantees string through the
 * caller's types, but here values read from JSON may be passed in, so handle them
 * defensively. The actual string conversion logic is the same).
 */
export function normalizeAddress(address) {
  if (address === null || address === undefined) return address
  return address
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[－ー―‐]/g, '-')
    .replace(/(\d+)丁目(\d+)番(\d+)号?/u, '$1-$2-$3')
    .replace(/(\d+)丁目(\d+)番地?(?!\d)/u, '$1-$2')
}

/**
 * Normalize a vendor's SNS URLs. Trim, drop empties, drop duplicates, exclude anything
 * other than `http(s)://`, at most 10 entries.
 *
 * Keep identical to normalizeSocialUrls in src/lib/social.ts (the logic is duplicated
 * because plain .mjs cannot import TS. When changing it, fix both).
 */
export function normalizeSocialUrls(list) {
  const seen = new Set()
  for (const raw of list ?? []) {
    const v = String(raw).trim()
    if (!/^https?:\/\//i.test(v)) continue
    if (!seen.has(v)) seen.add(v)
    if (seen.size >= 10) break
  }
  return [...seen]
}
