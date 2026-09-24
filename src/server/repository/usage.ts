import { COUNTED_TABLES, type CountedTable } from '../../lib/usage'

export type D1Usage = {
  /** データベースの大きさ（バイト）。クエリ結果の meta.size_after。取れなければ null */
  bytes: number | null
  rows: Record<CountedTable, number>
}

export type R2Usage = {
  count: number
  bytes: number
  /** 上限のページ数で打ち切った（実際はもっと多い） */
  truncated: boolean
}

/**
 * D1 の使用量。大きさは D1 が全クエリの結果に付ける meta.size_after（バイト）で見る
 * （PRAGMA page_count は D1 で使えない）。行数は 1 文で全テーブルぶんを数える。
 * drizzle の Db でなく D1Database を受けるのは meta を読むため。
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

/** R2 の一覧は 1 回 1,000 件。二人の写真なら数ページで終わるが、念のため上限を置く */
export const R2_LIST_MAX_PAGES = 10

/** R2 のオブジェクト数と合計サイズ。一覧の上限に達したら truncated: true */
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
