import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { currentActorEmail } from './members'
import { listLinkTargets } from './places'
import {
  deleteVideoCascade,
  ensureTags,
  getVideoDetail,
  listVideosWithLinks,
  upsertVideo,
  saveOrConflict,
} from './repository'
import { listTagNames } from './tags'
import { videoInput } from './videos.schema'
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
