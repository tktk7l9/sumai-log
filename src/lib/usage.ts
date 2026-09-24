/**
 * 設定ページの「環境」（リソースの使用量）と「利用者」（最後に使った日時）の純粋関数。
 *
 * 使用量は Worker の中から分かるものだけを扱う: D1 のデータベースの大きさ（クエリ結果の
 * meta.size_after）とテーブルごとの行数、R2 のオブジェクト数と合計サイズ。1 日あたりの
 * 読み書き回数やリクエスト数は Worker からは取れない（ダッシュボードで見る）。
 *
 * 「最後に使った日時」は Cloudflare Access のログイン時刻ではなく、そのメールで最後に
 * リクエストがあった時刻（Access のセッションは約 1 ヶ月続き、ログインの瞬間はアプリからは
 * 見えない）。settings テーブルに `lastSeen:<メール>` のキーで持つ。
 */

/** Cloudflare の無料枠（2026-09 時点）。D1 は 5 GB、R2 は 10 GB のストレージ */
export const D1_FREE_BYTES = 5 * 1024 ** 3
export const R2_FREE_BYTES = 10 * 1024 ** 3

/** 1,234 → '1.2 KB'。小さい値はそのままバイトで、1 KB 以上は 1 桁の小数 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB'] as const
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)} ${units[i]}`
}

/** 上限に対する割合（%、小数 1 桁）。上限が 0 以下なら 0 */
export function percentOf(used: number, limit: number): number {
  if (limit <= 0 || !Number.isFinite(used) || used <= 0) return 0
  return Math.round((used / limit) * 1000) / 10
}

/** 同じ人の「最後に使った日時」を書き直す間隔（ms）。リクエストのたびに D1 へ書かない */
export const SEEN_INTERVAL_MS = 10 * 60 * 1000

/** 前回書いた時刻から間隔が空いていれば true（初回は必ず true） */
export function shouldRecordSeen(
  lastWrittenMs: number | undefined,
  nowMs: number,
  intervalMs: number = SEEN_INTERVAL_MS,
): boolean {
  if (lastWrittenMs === undefined) return true
  return nowMs - lastWrittenMs >= intervalMs
}

export const LAST_SEEN_PREFIX = 'lastSeen:'

export function lastSeenKey(email: string): string {
  return `${LAST_SEEN_PREFIX}${email.trim().toLowerCase()}`
}

/** `lastSeen:<メール>` のキーからメールを取り出す。形が違えば null */
export function emailFromLastSeenKey(key: string): string | null {
  if (!key.startsWith(LAST_SEEN_PREFIX)) return null
  const email = key.slice(LAST_SEEN_PREFIX.length)
  return email === '' ? null : email
}

/** 行数を数えるテーブルと、画面に出す呼び名（テーブル名を利用者に見せない） */
export const COUNTED_TABLES = [
  'vendors',
  'properties',
  'places',
  'events',
  'visits',
  'photos',
  'videos',
  'comments',
  'vendor_news',
  'inbound_mails',
  'sources',
] as const
export type CountedTable = (typeof COUNTED_TABLES)[number]
export const COUNTED_TABLE_LABEL: Record<CountedTable, string> = {
  vendors: '業者',
  properties: '物件',
  places: '場所',
  events: '予定',
  visits: '見学記録',
  photos: '写真',
  videos: '動画メモ',
  comments: 'コメント',
  vendor_news: 'お知らせ',
  inbound_mails: 'メール',
  sources: '情報源',
}

/** 「見学記録 12・写真 40・…」のように 0 件は省いて並べる。全部 0 なら 'なし' */
export function formatRowCounts(rows: Partial<Record<CountedTable, number>>): string {
  const parts = COUNTED_TABLES.filter((t) => (rows[t] ?? 0) > 0).map(
    (t) => `${COUNTED_TABLE_LABEL[t]} ${rows[t]!.toLocaleString('ja-JP')}`,
  )
  return parts.length > 0 ? parts.join('・') : 'なし'
}
