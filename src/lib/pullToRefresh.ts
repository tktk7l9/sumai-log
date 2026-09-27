/**
 * Numeric calculations for pull-to-refresh. Only pure functions that do not touch the DOM
 * live here (touch subscription and rendering are in `src/components/PullToRefresh.tsx`).
 *
 * A PWA (standalone) has no browser-standard pull-to-refresh, and on top of that
 * `overscroll-behavior-y: none` stops the bounce, so the standard pull-to-refresh does not
 * work even when opened in a browser. The app provides it instead.
 */

/** Pulling up to this distance (px) triggers a refresh on release */
export const PULL_THRESHOLD = 72
/** Caps the distance the finger moved at this value (so that it does not stretch forever) */
export const PULL_MAX = 120
/** Height at which the indicator is held while refreshing */
export const PULL_HOLD = 56

/**
 * Converts the finger travel (px) into the visual pull amount. It moves lightly at first
 * and gets heavier the more you pull (starts at half the distance and approaches the
 * maximum asymptotically). Negative values and 0 give 0.
 */
export function pullDistance(dy: number): number {
  if (dy <= 0) return 0
  const eased = PULL_MAX * (1 - Math.exp(-dy / (PULL_MAX * 1.2)))
  return Math.round(Math.min(PULL_MAX, eased))
}

/** Whether to refresh on release */
export function shouldRefresh(distance: number): boolean {
  return distance >= PULL_THRESHOLD
}

/** Opacity of the indicator (faint at the start of the pull, 1 at the threshold) */
export function pullOpacity(distance: number): number {
  if (distance <= 0) return 0
  return Math.min(1, distance / PULL_THRESHOLD)
}
