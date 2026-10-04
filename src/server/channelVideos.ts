import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { channelVideoListInput, channelVideoWatchedInput } from './channelVideos.schema'
import { currentActorEmail } from './members'
import { channelSummaries, listChannelVideos, setChannelVideoWatched } from './repository'

export const listChannelVideosPage = createServerFn()
  .validator(channelVideoListInput)
  .handler(async ({ data }) => {
    const db = getDb()
    const [page, channels] = await Promise.all([
      listChannelVideos(db, { ...data, q: data.q || undefined }),
      channelSummaries(db),
    ])
    return { ...page, channels }
  })

/** ok: false = the video is gone (a re-import does not delete, so this is only a stale tab) */
export const markChannelVideoWatched = createServerFn({ method: 'POST' })
  .validator(channelVideoWatchedInput)
  .handler(async ({ data }) => ({
    ok: await setChannelVideoWatched(getDb(), data.id, data.watched, await currentActorEmail()),
  }))
