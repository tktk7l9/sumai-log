import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { currentActorEmail } from './members'
import { listLinkTargets } from './places'
import { quickAddVideo } from './quickVideo'
import {
  deleteVideoCascade,
  ensureTags,
  getVideoDetail,
  listVideosWithLinks,
  removeAddedVideo,
  upsertVideo,
  saveOrConflict,
} from './repository'
import { listTagNames } from './tags'
import { quickVideoInput, quickVideoUndoInput, videoInput } from './videos.schema'
import { idInput } from './zod'

// videoInput comes from videos.schema.ts (see there for why it was split for the tests).
// The public import path (videoInput/VideoInput available from './videos') does not change.
export { videoInput }
export type { VideoInput } from './videos.schema'

export const listVideos = createServerFn().handler(async () => listVideosWithLinks(getDb()))

export const getVideo = createServerFn()
  .validator(idInput)
  .handler(async ({ data }) => {
    const detail = await getVideoDetail(getDb(), data.id)
    if (!detail) throw notFound()
    return detail
  })

export const saveVideo = createServerFn({ method: 'POST' })
  .validator(videoInput)
  .handler(async ({ data }) => {
    const db = getDb()
    await ensureTags(db, data.tags)
    return saveOrConflict(async () => upsertVideo(db, data, await currentActorEmail()))
  })

/**
 * 「コピーしたリンクから動画を追加」: saves the memo with the title, channel and vendor looked up
 * here, in one request (the form needs a request for the title and another one to save)
 */
export const addVideoFromLink = createServerFn({ method: 'POST' })
  .validator(quickVideoInput)
  .handler(async ({ data }) => quickAddVideo(getDb(), data, await currentActorEmail()))

/** 「取り消す」 on the notification of addVideoFromLink */
export const undoAddedVideo = createServerFn({ method: 'POST' })
  .validator(quickVideoUndoInput)
  .handler(async ({ data }) => {
    await removeAddedVideo(getDb(), data.id, data.unmarkWatched)
    return { ok: true as const }
  })

export const deleteVideo = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    await deleteVideoCascade(getDb(), data.id)
    return { ok: true as const }
  })

/** Options for the video form: tag suggestions (seeds the default tags if there are none)
 * and the vendor list */
export const videoFormOptions = createServerFn().handler(async () => {
  // The vendor list uses the same listLinkTargets (src/server/places.ts) as the candidates form
  // (properties come back with it, but videoFormOptions does not use them)
  const [tags, targets] = await Promise.all([listTagNames(), listLinkTargets()])
  return { tags, vendors: targets.vendors }
})
