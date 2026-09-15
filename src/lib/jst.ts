/**
 * 台帳に流れ込む時刻表現を JST で表示する。
 *
 * D1 の datetime('now') は 'YYYY-MM-DD HH:MM:SS'（UTC、オフセット無し）。
 * それ以外の入力元は ISO 8601（'Z' や '+09:00' などのオフセット付き、
 * またはオフセット無し）で来ることがある。オフセットが無ければ UTC とみなす。
 * `new Date().toISOString()`（repository の upsert が updatedAt に使う）は
 * 常に小数点以下 3 桁の秒（'.333' 等）を含むため、秒の小数部も受ける。
 * Date.now() は使わない（呼び出し時刻に依存しない純粋関数にするため）。
 */

const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/

/**
 * UTC ミリ秒に直す。D1 の 'YYYY-MM-DD HH:MM:SS'（オフセット無し=UTC）と
 * ISO 8601（'Z' / '+09:00' のようなオフセット付き、またはオフセット無し=UTC。
 * 秒の小数部があってもなくてもよい）を受ける。この正規表現の形に合わない文字列は
 * null（呼び出し側で「読めない＝元の文字列のまま」などのフォールバックに使う。
 * feed.ts はここでの null を「最も古い扱い」に読み替える）。
 */
export function parseToUtcMs(value: string): number | null {
  const match = DATE_TIME_PATTERN.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute, second, fraction, offset] = match
  if (offset) {
    return Date.parse(
      `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction ?? ''}${offset}`,
    )
  }
  const ms = fraction ? Math.round(Number(fraction) * 1000) : 0
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    ms,
  )
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * JST の 'YYYY-MM-DD HH:mm'（withTime: false なら 'YYYY-MM-DD'）に直す。
 * 解釈できない文字列はそのまま返す。
 */
export function formatJst(value: string, opts?: { withTime?: boolean }): string {
  const utcMs = parseToUtcMs(value)
  if (utcMs === null) return value

  const jst = new Date(utcMs + 9 * 60 * 60 * 1000)
  const datePart = `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`
  if (opts?.withTime === false) return datePart
  return `${datePart} ${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}`
}

/** JST の 'YYYY-MM-DD' キー。アプリ内の呼び出し元は今は無い。lib の公開 API として維持 */
export function toJstDateKey(value: string): string {
  return formatJst(value, { withTime: false })
}
