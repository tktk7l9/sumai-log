import type { NewsCandidate } from './rss'

/**
 * The most candidates one fetch of one vendor keeps. A news page or feed shows a few dozen
 * items; without a cap a 1 MB page of `<li><a href="…20261114">` gave about 35,000 candidates
 * and 3,500 sequential D1 statements inside the shared daily Cron, ahead of the mail cleanup
 * and the channel refresh (security audit 2026-11-10).
 */
export const MAX_CANDIDATES_PER_FETCH = 100

/**
 * The newest `max` candidates by publishedOn ('YYYY-MM-DD', so string order is date order).
 * Ties keep the order of the page. Up to `max` items come back unchanged, in page order.
 */
export function newestCandidates(
  candidates: NewsCandidate[],
  max: number = MAX_CANDIDATES_PER_FETCH,
): NewsCandidate[] {
  if (candidates.length <= max) return candidates
  // Array#sort is stable, so equal dates stay in page order
  return [...candidates]
    .sort((a, b) => (a.publishedOn < b.publishedOn ? 1 : a.publishedOn > b.publishedOn ? -1 : 0))
    .slice(0, max)
}
