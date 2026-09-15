import { canonicalYouTubeUrl, youtubeThumbnailUrl } from '../lib/youtube'

export type OEmbedResult = { title: string; channel: string | null; thumbnailUrl: string }

/**
 * YouTube の oEmbed エンドポイントを叩いて題名・チャンネル・サムネを取る。
 * 5 秒で諦める。非 200・JSON 不正・例外はすべて null（呼び出し側は「自動取得
 * できませんでした」に落とす）。thumbnail_url が無ければ youtubeThumbnailUrl(id) で補う。
 */
export async function fetchYouTubeOEmbed(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OEmbedResult | null> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    canonicalYouTubeUrl(videoId),
  )}&format=json`
  try {
    const res = await fetchImpl(oembedUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return null
    const body: unknown = await res.json()
    if (typeof body !== 'object' || body === null) return null
    const record = body as Record<string, unknown>
    if (typeof record.title !== 'string') return null
    return {
      title: record.title,
      channel: typeof record.author_name === 'string' ? record.author_name : null,
      thumbnailUrl:
        typeof record.thumbnail_url === 'string'
          ? record.thumbnail_url
          : youtubeThumbnailUrl(videoId),
    }
  } catch {
    return null
  }
}
