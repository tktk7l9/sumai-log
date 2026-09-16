/**
 * 業者のお知らせ／サイトアイコン取得の失敗理由を、設定画面向けの文言に変換する純粋関数。
 *
 * 一部の業者サイトは Cloudflare の IP レンジからのアクセスを一律拒否する（実機で確認済み:
 * Apache の WAF が User-Agent に関係なく 403 を返す）。この場合エラーは newsFetcher.ts の
 * `readCappedBytes` 呼び出し元が残す `HTTP ${response.status}`（例: `HTTP 403`）という形に
 * なる。これは「取得の実装が悪い」のではなく「サイト側が Cloudflare を拒否している」ため、
 * ユーザーにはその通りに伝える（自動取得できない事実を隠さない）。
 */

/** Cloudflare からのアクセスを拒否している可能性が高い HTTP ステータス。
 * 403: Forbidden（最も一般的な WAF 拒否）。401: Unauthorized（一部の WAF が返す）。
 * 451: Unavailable For Legal Reasons（地域/ネットワーク単位のブロックで稀に使われる）。 */
const BLOCKED_STATUSES = new Set(['401', '403', '451'])

const HTTP_STATUS_ERROR = /^HTTP (\d{3})$/

const BLOCKED_HINT =
  'このサイトはお知らせを自動取得できません。メール取り込み（予定）か URL を空にしてください'

export type FetchErrorDescription = { label: string; hint?: string }

/**
 * `error`（vendors.news_fetch_error 等に保存された文字列）を表示用の label/hint に変換する。
 * `HTTP 403` のような形（newsFetcher.ts が残す）を Cloudflare 拒否と判定し、率直な文言に
 * 言い換える。それ以外の理由（タイムアウト・パース失敗等）はそのまま label に使う。
 * `error` が null（未取得・直近は成功）のときは空文字の label を返す（呼び出し側は
 * `error` が truthy のときだけ呼ぶ想定だが、null を渡しても例外にはしない）。
 */
export function describeFetchError(error: string | null): FetchErrorDescription {
  if (!error) return { label: '' }
  const m = HTTP_STATUS_ERROR.exec(error)
  if (m && BLOCKED_STATUSES.has(m[1])) {
    return {
      label: `サイト側が Cloudflare からのアクセスを拒否（HTTP ${m[1]}）`,
      hint: BLOCKED_HINT,
    }
  }
  return { label: error }
}
