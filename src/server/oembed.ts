import { canonicalYouTubeUrl, youtubeThumbnailUrl } from '../lib/youtube'

export type OEmbedResult = { title: string; channel: string | null; thumbnailUrl: string }

/** Truncation limits so that videoInput in videos.ts (title max 300 / channel max 200) is never exceeded */
const TITLE_MAX = 300
const CHANNEL_MAX = 200

/**
 * Hits the YouTube oEmbed endpoint and gets the title, channel and thumbnail.
 * Gives up after 5 seconds by default (replaceable with timeoutMs, for tests). Non-200,
 * invalid JSON and exceptions all become null (the caller falls back to
 * "自動取得できませんでした" (could not fetch automatically)). If thumbnail_url is
 * missing, it is filled in with youtubeThumbnailUrl(id). title/channel are truncated here
 * so they do not exceed the videoInput limits (so that the form's zod validation does not
 * fail on the oEmbed output alone).
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
