import { canonicalYouTubeUrl, youtubeThumbnailUrl } from '../lib/youtube'

export type OEmbedResult = { title: string; channel: string | null; thumbnailUrl: string }

/** videos.ts の videoInput（title max 300 / channel max 200）を絶対に超えないように切る上限 */
const TITLE_MAX = 300
const CHANNEL_MAX = 200

/**
 * YouTube の oEmbed エンドポイントを叩いて題名・チャンネル・サムネを取る。
 * 既定 5 秒（timeoutMs で差し替え可・テスト用）で諦める。非 200・JSON 不正・例外は
 * すべて null（呼び出し側は「自動取得できませんでした」に落とす）。thumbnail_url が
 * 無ければ youtubeThumbnailUrl(id) で補う。title/channel は videoInput の上限を
 * 超えないようここで切り詰める（フォームの zod 検証が oEmbed の出力だけで落ちないように）。
 */
export async function fetchYouTubeOEmbed(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<OEmbedResult | null> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    canonicalYouTubeUrl(videoId),
  )}&format=json`
  try {
    const res = await fetchImpl(oembedUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return null
    const body: unknown = await res.json()
    if (typeof body !== 'object' || body === null) return null
    const record = body as Record<string, unknown>
    if (typeof record.title !== 'string') return null
    return {
      title: record.title.slice(0, TITLE_MAX),
      channel:
        typeof record.author_name === 'string' ? record.author_name.slice(0, CHANNEL_MAX) : null,
      thumbnailUrl:
        typeof record.thumbnail_url === 'string'
          ? record.thumbnail_url
          : youtubeThumbnailUrl(videoId),
    }
  } catch {
    return null
  }
}
