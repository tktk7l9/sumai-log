import type { Db } from '../db/client'
import { memoDefaultsOf } from '../lib/videoMemo'
import { fetchYouTubeOEmbed, type OEmbedResult } from './oembed'
import { channelVideoForMemo, findVideoByVideoId, insertVideo } from './repository'

/**
 * Adding a video memo from a copied link in one step (the major task of the app: most evenings
 * one video is added, with nothing but the link and the day; measured 2026-11-13).
 *
 * No imports from TanStack Start here, so the worker tests can call it (same reason as
 * videos.schema.ts).
 */
export type QuickVideoResult =
  | { status: 'saved'; id: string; title: string; markedWatched: boolean }
  /** A memo of this video is there already: nothing was written */
  | { status: 'exists'; id: string; title: string }
  /** The title could not be read (a private or removed video, YouTube not answering): nothing
   * was written, and the form takes over with the link filled in */
  | { status: 'untitled'; videoId: string }

export async function quickAddVideo(
  db: Db,
  input: { videoId: string; watchedOn: string },
  actorEmail: string,
  lookUp: (videoId: string) => Promise<OEmbedResult | null> = fetchYouTubeOEmbed,
): Promise<QuickVideoResult> {
  const { videoId, watchedOn } = input
  const existing = await findVideoByVideoId(db, videoId)
  if (existing) return { status: 'exists', ...existing }

  // An imported channel video already has its title, channel and vendor: no request to YouTube
  const channelVideo = await channelVideoForMemo(db, videoId)
  const base = memoDefaultsOf(videoId, channelVideo)
  const hit = channelVideo ? null : await lookUp(videoId)
  const title = base.title ?? hit?.title
  if (!title) return { status: 'untitled', videoId }

  const { id, markedWatched } = await insertVideo(
    db,
    {
      url: base.url,
      videoId,
      title,
      channel: base.channel ?? hit?.channel ?? null,
      thumbnailUrl: hit?.thumbnailUrl ?? base.thumbnailUrl,
      watchedOn,
      vendorId: base.vendorId ?? null,
    },
    actorEmail,
  )
  return { status: 'saved', id, title, markedWatched }
}
