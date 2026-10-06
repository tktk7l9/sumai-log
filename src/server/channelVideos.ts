import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { channelVideoListInput, channelVideoWatchedInput } from './channelVideos.schema'
import { nowJstIso } from './events'
import { currentActorEmail } from './members'
import { matchedFromSummaries } from '../lib/channelVideos/summary'
import {
  channelSummaries,
  countChannelVideos,
  listChannelVideoRows,
  setChannelVideoWatched,
} from './repository'

export const listChannelVideosPage = createServerFn()
  .validator(channelVideoListInput)
  .handler(async ({ data }) => {
    const db = getDb()
    const filter = { ...data, q: data.q || undefined }
    // The per-channel summaries already hold the counts per kind and watched state, so only a
    // title search needs its own count (one scan of the table less per open)
    const [rows, channels, counted] = await Promise.all([
      listChannelVideoRows(db, filter),
      channelSummaries(db),
      filter.q ? countChannelVideos(db, filter) : null,
    ])
    const matched = counted ?? matchedFromSummaries(channels, filter)
    // Today (JST) by the server, for the "New" tag: the page and its hydration agree
    return { rows, matched, channels, todayKey: nowJstIso().slice(0, 10) }
  })

/** ok: false = the video is gone (a re-import does not delete, so this is only a stale tab) */
export const markChannelVideoWatched = createServerFn({ method: 'POST' })
  .validator(channelVideoWatchedInput)
  .handler(async ({ data }) => ({
    ok: await setChannelVideoWatched(getDb(), data.id, data.watched, await currentActorEmail()),
  }))
