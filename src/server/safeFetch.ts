/**
 * 許可された URL への手動リダイレクト追従（SSRF 対策の一部）。newsFetcher.ts
 * （業者のお知らせ取得）・vendorImages.ts（ファビコン・代表者写真取得）で共有する。
 *
 * Cloudflare Workers の fetch は既定でリダイレクトを自動で追う。追わせたままだと
 * 「許可された URL への最初の fetch」を通過した後、その先の 3xx が isAllowedRemoteUrl
 * を一度も通らずに（内部ホスト等へ）飛んでしまう。そのため `redirect: 'manual'` にし、
 * 3xx を受け取るたびにここで Location を「今いる URL」基準で解決し、isAllowed
 * （既定 isAllowedRemoteUrl）を再度通してから次の hop を fetch する（許可されない
 * hop 先には絶対に fetchImpl を呼ばない）。maxHops（既定 3）を超えて 3xx が続く場合も
 * 同じエラーにする。Location が無い 3xx はリダイレクトとして扱わず、そのままの
 * レスポンスを返す（後段の response.ok チェックに委ねる）。
 */

import { truncate } from '../lib/news/text'
import { isAllowedRemoteUrl } from '../lib/news/url'

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
/** 呼び出し元に返すエラーメッセージの上限（D1 の news_fetch_error 等、保存先の都合） */
const ERROR_MESSAGE_MAX = 200

export type GuardedFetchOutcome = { response: Response; finalUrl: string } | { error: string }

export type FetchWithGuardedRedirectsOptions = {
  /** 1 hop あたりのタイムアウト（ミリ秒）。hop ごとに新しい AbortSignal.timeout を作る */
  timeoutMs: number
  headers?: Record<string, string>
  /** 追従する最大リダイレクト回数（初回の fetch は含まない）。既定 3 */
  maxHops?: number
  /** hop 先の URL を許可するかの判定。既定 isAllowedRemoteUrl */
  isAllowed?: (url: string) => boolean
  fetchImpl?: typeof fetch
  /** hop 上限超過・Location の解決失敗・許可されない hop 先のときのエラーメッセージ */
  redirectBlockedError?: string
}

function errorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : '取得に失敗しました'
  return truncate(message, ERROR_MESSAGE_MAX)
}

export async function fetchWithGuardedRedirects(
  startUrl: string,
  opts: FetchWithGuardedRedirectsOptions,
): Promise<GuardedFetchOutcome> {
  const {
    timeoutMs,
    headers,
    maxHops = 3,
    isAllowed = isAllowedRemoteUrl,
    fetchImpl = fetch,
    redirectBlockedError = 'リダイレクト先が許可されていません',
  } = opts

  let currentUrl = startUrl

  for (let hop = 0; ; hop++) {
    let response: Response
    try {
      response = await fetchImpl(currentUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        headers,
        redirect: 'manual',
      })
    } catch (e) {
      return { error: errorMessage(e) }
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: currentUrl }
    }
    if (hop >= maxHops) {
      return { error: redirectBlockedError }
    }

    const location = response.headers.get('location')
    if (!location) {
      return { response, finalUrl: currentUrl }
    }

    let resolved: string
    try {
      resolved = new URL(location, currentUrl).href
    } catch {
      return { error: redirectBlockedError }
    }
    if (!isAllowed(resolved)) {
      return { error: redirectBlockedError }
    }

    currentUrl = resolved
  }
}
