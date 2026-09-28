/**
 * Pure helpers for scripts/check-pii.mjs.
 *
 * A real location slipped into a comment once as a "sample" coordinate and stayed in the
 * public history until the history was rewritten (2026-09-27). The word list taken from
 * `.dev.vars` cannot catch that, because a coordinate is not a word anyone can list in
 * advance. So coordinates are detected by their shape instead.
 */

/**
 * Coordinates that are allowed to appear in tracked files. Every entry is either made up
 * or a public landmark. Compared after removing whitespace.
 *
 * To add one: use a value that points at no place related to the owners, and say what it is.
 */
export const ALLOWED_COORDINATES = [
  '35.000000,139.000000', // round placeholder named in docs/superpowers/plans
  '35.123456,139.123456', // made-up placeholder shown in the place form
  '35.681236,139.767125', // Tokyo Station, the sample in src/lib/coords.ts
  '35.504306,139.512556', // result of a made-up DMS value in src/lib/coords.test.ts
]

/**
 * A latitude and a longitude inside Japan, each with 5 or more decimal places (about 1 m),
 * separated by at most 40 characters that contain no digit. That covers `35.1, 139.1`,
 * `lat: 35.1, lng: 139.1` and the same pair split over two lines.
 * Fewer decimals than 5 are not reported: they are too coarse to identify a lot, and
 * ordinary numbers would start to match.
 */
const PAIR =
  /(?<![\d.])((?:2[4-9]|3\d|4[0-5])\.\d{5,})(?!\d)[^\d]{1,40}?((?:12[2-9]|1[34]\d|15[0-3])\.\d{5,})(?![\d.])/g

/**
 * Returns the 1-based line numbers where a coordinate pair that is not on the allow list
 * starts. The values themselves are not returned, so that they never reach a log.
 *
 * @param {string} content
 * @param {readonly string[]} [allowed]
 * @returns {number[]}
 */
export function findCoordinateLines(content, allowed = ALLOWED_COORDINATES) {
  const allow = new Set(allowed.map((v) => v.replace(/\s+/g, '')))
  const lines = []
  for (const match of content.matchAll(PAIR)) {
    if (allow.has(`${match[1]},${match[2]}`)) continue
    lines.push(content.slice(0, match.index).split('\n').length)
  }
  return lines
}
