import { canonicalYouTubeUrl, youtubeThumbnailUrl } from './youtube'

/**
 * What a video memo (記録 > 動画) starts with when it is written from the videos tab
 * (「メモを書く」 on a channel video). Until 2026-10-06 the same video was pasted into the
 * memo form by hand after being marked watched on /works (50 of 72 memos were channel
 * videos).
 */

export type ChannelVideoForMemo = {
  videoId: string
  title: string
  channel: string
  vendorId: string | null
}

export type MemoDefaults = {
  url: string
  thumbnailUrl: string
  title?: string
  channel?: string
  vendorId?: string | null
}

/** `channelVideo` is null when the id is not one of the imported channel videos */
export function memoDefaultsOf(
  videoId: string,
  channelVideo: ChannelVideoForMemo | null,
): MemoDefaults {
  const base = { url: canonicalYouTubeUrl(videoId), thumbnailUrl: youtubeThumbnailUrl(videoId) }
  if (!channelVideo) return base
  return {
    ...base,
    title: channelVideo.title,
    channel: channelVideo.channel,
    vendorId: channelVideo.vendorId,
  }
}
