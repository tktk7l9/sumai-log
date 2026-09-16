/**
 * 業者のお知らせ（RSS / HTML）を実際に取りに行く層。design.md §1 の方針:
 * 1 ソースあたり 10 秒タイムアウト・1 MB 上限・User-Agent 明示。失敗しても他の
 * ソースは続行し、`vendors.news_fetch_error` に理由を残す。
 *
 * `fetchImpl` を注入できるようにして、worker テストでは架空の RSS/HTML を返す
 * フェイクに差し替える（実際のベンダーサイトを叩かない）。
 */

import type { Db } from '../db/client'
import type { Vendor } from '../db/schema'
import { extractEvent } from '../lib/news/eventDate'
import { parseHtmlList } from '../lib/news/htmlList'
import { parseRss, type NewsCandidate } from '../lib/news/rss'
import { isAllowedNewsUrl } from '../lib/news/url'
import { insertNewsIfNew, listNewsSources, markNewsFetched, type NewNews } from './repository/news'

export type NewsSourceVendor = Pick<Vendor, 'id' | 'name' | 'newsUrl' | 'newsSource'>

const TIMEOUT_MS = 10_000
const MAX_BYTES = 1_000_000
const USER_AGENT = 'sumai-log/1.0'
const TOO_LARGE_ERROR = `応答が上限（1MB）を超えました`

type FetchOutcome = { candidates: NewsCandidate[] } | { error: string }

/**
 * レスポンス本文を読む。`content-length` があればそれで先に弾く（本文を読まずに済む）。
 * 無ければストリームを読みながら合計バイト数を数え、1 MB を超えた時点で読み取りを
 * 打ち切る（全部読み切ってから切り捨てない）。
 */
async function readCappedText(response: Response): Promise<string | { error: string }> {
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    return { error: TOO_LARGE_ERROR }
  }

  const reader = response.body?.getReader()
  if (!reader) {
    const text = await response.text()
    return text.length > MAX_BYTES ? { error: TOO_LARGE_ERROR } : text
  }

  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {})
      return { error: TOO_LARGE_ERROR }
    }
    chunks.push(value)
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8').decode(merged)
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : '取得に失敗しました'
}

async function fetchCandidates(
  vendor: NewsSourceVendor,
  fetchImpl: typeof fetch,
): Promise<FetchOutcome> {
  if (!vendor.newsUrl) return { error: '取得 URL が未設定です' }
  if (!vendor.newsSource) return { error: '取得方法が未設定です' }
  // フォーム側（src/server/zod.ts の optionalHttpsUrl）でも同じ判定を通しているが、
  // 既存データ（フォームを経由しない seed 取り込み等）にも同じ防御を掛けるため、
  // 実際に fetch する直前にもう一度ここで弾く（SSRF 対策の多層防御）。
  if (!isAllowedNewsUrl(vendor.newsUrl)) return { error: 'URL が許可されていません' }

  let response: Response
  try {
    response = await fetchImpl(vendor.newsUrl, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT },
    })
  } catch (e) {
    return { error: errorMessage(e) }
  }

  if (!response.ok) return { error: `HTTP ${response.status}` }

  let body: string | { error: string }
  try {
    body = await readCappedText(response)
  } catch (e) {
    return { error: errorMessage(e) }
  }
  if (typeof body !== 'string') return body

  const candidates =
    vendor.newsSource === 'rss' ? parseRss(body) : parseHtmlList(body, vendor.newsUrl)
  return { candidates }
}

/**
 * 1 業者ぶん取得して保存する。`newsSource` に応じて parseRss / parseHtmlList を選び、
 * 各候補に extractEvent を適用してから insertNewsIfNew（新着のみ INSERT）、最後に
 * 必ず markNewsFetched（成功なら error は null、失敗なら理由）を呼ぶ。
 */
export async function fetchVendorNews(
  db: Db,
  vendor: NewsSourceVendor,
  fetchImpl: typeof fetch = fetch,
): Promise<{ added: number; error: string | null }> {
  const outcome = await fetchCandidates(vendor, fetchImpl)
  if ('error' in outcome) {
    await markNewsFetched(db, vendor.id, outcome.error)
    console.log(`news: ${vendor.id} added=0 error=${outcome.error}`)
    return { added: 0, error: outcome.error }
  }

  const rows: NewNews[] = outcome.candidates.map((c) => {
    const event = extractEvent(`${c.title} ${c.summary ?? ''}`, c.publishedOn)
    return {
      vendorId: vendor.id,
      url: c.url,
      title: c.title,
      summary: c.summary,
      publishedOn: c.publishedOn,
      eventStart: event?.start ?? null,
      eventEnd: event?.end ?? null,
      eventKind: event?.kind ?? null,
    }
  })

  const added = await insertNewsIfNew(db, rows)
  await markNewsFetched(db, vendor.id, null)
  console.log(`news: ${vendor.id} added=${added} error=null`)
  return { added, error: null }
}

/**
 * newsUrl が設定されている全業者を順に取得する。1 社の失敗（fetchVendorNews が
 * 想定外の例外を投げた場合も含め）で他の業者の取得を止めない。
 */
export async function fetchAllVendorNews(
  db: Db,
  fetchImpl: typeof fetch = fetch,
): Promise<{ vendorId: string; added: number; error: string | null }[]> {
  const sources = await listNewsSources(db)
  const results: { vendorId: string; added: number; error: string | null }[] = []
  for (const vendor of sources) {
    try {
      const { added, error } = await fetchVendorNews(db, vendor, fetchImpl)
      results.push({ vendorId: vendor.id, added, error })
    } catch (e) {
      const message = errorMessage(e)
      console.log(`news: ${vendor.id} added=0 error=${message}`)
      results.push({ vendorId: vendor.id, added: 0, error: message })
    }
  }
  return results
}
