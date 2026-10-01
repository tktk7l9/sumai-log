import type { ParsedWork } from './types'

/** A SQL literal on one line (line breaks become a space: the output is one statement per line) */
export function sqlValue(value: string | number | null): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${value.replace(/\s*[\r\n]+\s*/g, ' ').replaceAll("'", "''")}'`
}

/** Columns the site decides. Everything else (id, created_at, watched_*, video_source) is the app's */
const SITE_COLUMNS = [
  'site',
  'vendor_id',
  'title',
  'category',
  'location',
  'completed_on',
  'points',
  'ua_value',
  'c_value',
  'family',
  'site_area_tsubo',
  'floor_area_tsubo',
  'total_area_tsubo',
  'layout',
  'sort_order',
] as const

/**
 * Upsert of one work keyed by source_url. Re-running never touches the watched flag, and a
 * video pasted by hand (video_source = 'manual') is kept over the site's.
 */
export function workUpsertSql(work: ParsedWork, id: string): string {
  const values: Record<(typeof SITE_COLUMNS)[number], string | number | null> = {
    site: work.site,
    vendor_id: work.vendorId,
    title: work.title,
    category: work.category,
    location: work.location,
    completed_on: work.completedOn,
    points: JSON.stringify(work.points),
    ua_value: work.uaValue,
    c_value: work.cValue,
    family: work.family,
    site_area_tsubo: work.siteAreaTsubo,
    floor_area_tsubo: work.floorAreaTsubo,
    total_area_tsubo: work.totalAreaTsubo,
    layout: work.layout,
    sort_order: work.sortOrder,
  }
  const columns = ['id', 'source_url', ...SITE_COLUMNS, 'youtube_video_id']
  const literals = [
    sqlValue(id),
    sqlValue(work.sourceUrl),
    ...SITE_COLUMNS.map((c) => sqlValue(values[c])),
    sqlValue(work.youtubeVideoId),
  ]
  const updates = [
    ...SITE_COLUMNS.map((c) => `${c} = excluded.${c}`),
    "youtube_video_id = CASE WHEN works.video_source = 'manual' THEN works.youtube_video_id ELSE excluded.youtube_video_id END",
    "updated_at = datetime('now')",
  ]
  return (
    `INSERT INTO works (${columns.join(', ')}) VALUES (${literals.join(', ')}) ` +
    `ON CONFLICT(source_url) DO UPDATE SET ${updates.join(', ')};`
  )
}
