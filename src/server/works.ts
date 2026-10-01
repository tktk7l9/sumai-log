import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { currentActorEmail } from './members'
import { listWorksWithVendor, setWorkVideo, setWorkWatched } from './repository'
import { workVideoInput, workWatchedInput } from './works.schema'

export const listWorks = createServerFn().handler(async () => listWorksWithVendor(getDb()))

/** ok: false = the work is gone (a re-import does not delete, so this is only a stale tab) */
export const markWorkWatched = createServerFn({ method: 'POST' })
  .validator(workWatchedInput)
  .handler(async ({ data }) => ({
    ok: await setWorkWatched(getDb(), data.id, data.watched, await currentActorEmail()),
  }))

export const saveWorkVideo = createServerFn({ method: 'POST' })
  .validator(workVideoInput)
  .handler(async ({ data }) => ({ ok: await setWorkVideo(getDb(), data.id, data.videoId) }))
