/**
 * 情報源フォームの「取得」ボタンの実処理。newsFetcher.ts / vendorImagesFetcher.ts と
 * 同じ理由でファイルを分けている: createServerFn でラップしていない素の関数だけを
 * 置くことで sourcesFetcher.worker-test.ts から直接呼べる（No Start context の制約を
 * 受けない）。createServerFn のラッパーは sources.ts 側に置く。
 *
 * YouTube チャンネル URL だけを対象にする（brief どおり）。他サイトの <title>/
 * og:description/favicon 取得はここでは行わない（Task 6 の業者ファビコン取得
 * パイプラインとは別物で、情報源の「取得」は YouTube チャンネル限定）。
 */

import { isAllowedRemoteUrl } from '../lib/news/url'
import { isAllowedAvatarUrl, parseYoutubeChannelUrl } from '../lib/sources'
import { extractYoutubeMeta } from '../lib/sources/youtubeMeta'
import { fetchWithGuardedRedirects } from './safeFetch'

const FETCH_TIMEOUT_MS = 10_000
const MAX_HTML_BYTES = 1_000_000
const USER_AGENT = 'sumai-log/1.0'
const ERROR_MESSAGE_MAX = 200
const NOT_YOUTUBE_ERROR =
  'YouTube チャンネルの URL のみ自動取得できます（例: https://www.youtube.com/@channel）。手入力してください'
const URL_NOT_ALLOWED_ERROR = 'URL が許可されていません'
const FETCH_FAILED_ERROR = 'ページを取得できませんでした（サイズ上限超過、または読めない形式）'

function errorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : '取得に失敗しました'
  return message.length > ERROR_MESSAGE_MAX ? message.slice(0, ERROR_MESSAGE_MAX) : message
}

/** レスポンス本文をバイト列のまま読む。newsFetcher.ts の readCappedBytes /
 * vendorImagesFetcher.ts の readCapped と同じ方針（content-length があれば先に弾く、
 * 無ければストリームを数えながら上限超過時点で打ち切る）。この上限はこのファイル専用。 */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > maxBytes) return null

  const reader = response.body?.getReader()
  if (!reader) {
    const buf = new Uint8Array(await response.arrayBuffer())
    return buf.byteLength > maxBytes ? null : buf
  }

  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

export type ResolveSourceFields = {
  name: string | null
  description: string | null
  avatarUrl: string | null
  handle: string | null
  channelId: string | null
}

export type ResolveSourceResult =
  { ok: true; fields: ResolveSourceFields } | { ok: false; error: string }

/**
 * URL が YouTube チャンネルの形（src/lib/sources.ts の parseYoutubeChannelUrl）でなければ
 * 即座にエラーを返す。そうでなければ、SSRF 対策の isAllowedRemoteUrl を通してから
 * `fetchWithGuardedRedirects`（10 秒タイムアウト・手動リダイレクト追従）でページを取得し、
 * 1MB 上限で読み、og:title/og:description/og:image/channelId を抜く（youtubeMeta.ts）。
 * URL のパス自体から分かる handle/channelId を優先し、無ければページから抜いた値で補う。
 * 例外は投げない（design 通り）。
 */
export async function resolveSourceCore(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolveSourceResult> {
  const parsed = parseYoutubeChannelUrl(url)
  if (!parsed) return { ok: false, error: NOT_YOUTUBE_ERROR }
  if (!isAllowedRemoteUrl(url)) return { ok: false, error: URL_NOT_ALLOWED_ERROR }

  try {
    const outcome = await fetchWithGuardedRedirects(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      headers: { 'Accept-Language': 'ja', Cookie: 'CONSENT=YES+1', 'User-Agent': USER_AGENT },
      fetchImpl,
    })
    if ('error' in outcome) return { ok: false, error: outcome.error }
    if (!outcome.response.ok) return { ok: false, error: `HTTP ${outcome.response.status}` }

    const bytes = await readCapped(outcome.response, MAX_HTML_BYTES)
    if (!bytes) return { ok: false, error: FETCH_FAILED_ERROR }

    const html = new TextDecoder('utf-8').decode(bytes)
    const meta = extractYoutubeMeta(html)
    const avatarUrl = meta.imageUrl && isAllowedAvatarUrl(meta.imageUrl) ? meta.imageUrl : null
    const channelId = ('channelId' in parsed ? parsed.channelId : null) ?? meta.channelId
    const handle = 'handle' in parsed ? parsed.handle : null

    return {
      ok: true,
      fields: { name: meta.title, description: meta.description, avatarUrl, handle, channelId },
    }
  } catch (e) {
    return { ok: false, error: errorMessage(e) }
  }
}
