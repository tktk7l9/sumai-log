/**
 * Filtering and the aligned "Data" view of the works page (/works). The types ask only for
 * the columns each function reads, so this file does not depend on the DB schema.
 */

export type WorkFilter = { vendorId?: string; hasVideo?: boolean; unwatched?: boolean }

type Filterable = {
  vendorId: string | null
  youtubeVideoId: string | null
  watchedAt: string | null
}

export function filterWorks<T extends Filterable>(works: T[], filter: WorkFilter): T[] {
  return works.filter(
    (w) =>
      (!filter.vendorId || w.vendorId === filter.vendorId) &&
      (!filter.hasVideo || w.youtubeVideoId !== null) &&
      (!filter.unwatched || w.watchedAt === null),
  )
}

export function watchedSummary(works: Pick<Filterable, 'youtubeVideoId' | 'watchedAt'>[]) {
  return {
    total: works.length,
    withVideo: works.filter((w) => w.youtubeVideoId !== null).length,
    watched: works.filter((w) => w.watchedAt !== null).length,
  }
}

/** Vendors that have at least one work, in the order they first appear */
export function vendorOptions(
  works: { vendorId: string | null; vendorName: string | null }[],
): { id: string; name: string }[] {
  const options = new Map<string, string>()
  for (const { vendorId, vendorName } of works) {
    if (vendorId && vendorName && !options.has(vendorId)) options.set(vendorId, vendorName)
  }
  return [...options].map(([id, name]) => ({ id, name }))
}

/** 50.5 -> '50.5坪' (at most 2 decimals, no trailing zeros) */
export function formatTsubo(value: number): string {
  return `${Number(value.toFixed(2))}坪`
}

export type WorkSpec = {
  points: string[]
  family: string | null
  /** Site, floor, total: in this order, only those the site gave */
  areas: { label: string; value: string }[]
  layout: string | null
  /** None of the four blocks has a value */
  isEmpty: boolean
}

type SpecSource = {
  points: string[]
  family: string | null
  siteAreaTsubo: number | null
  floorAreaTsubo: number | null
  totalAreaTsubo: number | null
  layout: string | null
}

/** The four blocks of the aligned view, in the fixed order: points, family, area, layout */
export function specOf(work: SpecSource): WorkSpec {
  const areas = [
    { label: '敷地面積', tsubo: work.siteAreaTsubo },
    { label: '延床面積', tsubo: work.floorAreaTsubo },
    { label: '総施工面積', tsubo: work.totalAreaTsubo },
  ].flatMap(({ label, tsubo }) => (tsubo === null ? [] : [{ label, value: formatTsubo(tsubo) }]))
  return {
    points: work.points,
    family: work.family,
    areas,
    layout: work.layout,
    isEmpty:
      work.points.length === 0 &&
      work.family === null &&
      areas.length === 0 &&
      work.layout === null,
  }
}
