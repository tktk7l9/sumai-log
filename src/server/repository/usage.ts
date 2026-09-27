import { COUNTED_TABLES, type CountedTable } from '../../lib/usage'

export type D1Usage = {
  /** Database size (bytes). meta.size_after of a query result. null if unavailable */
  bytes: number | null
  rows: Record<CountedTable, number>
}

export type R2Usage = {
  count: number
  bytes: number
  /** Cut off at the page limit (there are actually more) */
  truncated: boolean
}

/**
 * D1 usage. The size is read from meta.size_after (bytes), which D1 attaches to the
 * result of every query (PRAGMA page_count cannot be used on D1). Row counts for all
 * tables are counted in 1 statement. It takes D1Database rather than drizzle's Db in
 * order to read meta.
 */
export async function measureD1(d1: D1Database): Promise<D1Usage> {
  const select = COUNTED_TABLES.map((t) => `(SELECT count(*) FROM ${t}) AS ${t}`).join(', ')
  const result = await d1.prepare(`SELECT ${select}`).all<Record<CountedTable, number>>()
  const row = result.results[0]
  const rows = Object.fromEntries(COUNTED_TABLES.map((t) => [t, Number(row?.[t] ?? 0)])) as Record<
    CountedTable,
    number
  >
  const size = (result.meta as { size_after?: unknown } | undefined)?.size_after
  return { bytes: typeof size === 'number' && Number.isFinite(size) ? size : null, rows }
}

/** An R2 list returns 1,000 items per call. Two people's photos fit in a few pages; capped just in case */
export const R2_LIST_MAX_PAGES = 10

/** The R2 object count and total size. truncated: true when the list limit is reached */
export async function measureR2(bucket: R2Bucket): Promise<R2Usage> {
  let count = 0
  let bytes = 0
  let cursor: string | undefined
  for (let page = 0; page < R2_LIST_MAX_PAGES; page++) {
    const listed = await bucket.list({ limit: 1000, cursor })
    for (const o of listed.objects) {
      count++
      bytes += o.size
    }
    if (!listed.truncated) return { count, bytes, truncated: false }
    cursor = listed.cursor
  }
  return { count, bytes, truncated: true }
}
