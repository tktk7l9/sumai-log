import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { currentActorEmail } from './members'
import { listLinkTargets } from './places'
import { deleteSourceRow, listSourcesWithLinks, upsertSource } from './repository'
import { resolveSourceCore } from './sourcesFetcher'
import { resolveSourceInput, sourceInput } from './sources.schema'
import { idInput } from './zod'

// sourceInput comes from sources.schema.ts (see there for why it was split for the tests).
// The public import path (sourceInput/SourceInput can be taken from './sources') does not change.
export { sourceInput }
export type { SourceInput } from './sources.schema'

export const listSources = createServerFn().handler(async () => listSourcesWithLinks(getDb()))

export const saveSource = createServerFn({ method: 'POST' })
  .validator(sourceInput)
  .handler(async ({ data }) => ({
    id: await upsertSource(getDb(), data, await currentActorEmail()),
  }))

/** ok: false if the row is already gone (same pattern as deletePhoto. Unlike deleteVideo
 * in videos.ts, this one tells the caller whether the target existed) */
export const deleteSource = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => ({ ok: (await deleteSourceRow(getDb(), data.id)) !== null }))

/** The "取得" (Fetch) button of the form. Targets only YouTube channel URLs
 * (see sourcesFetcher.ts). The real work lives outside createServerFn (a plain function),
 * and this only wraps it */
export const resolveSource = createServerFn({ method: 'POST' })
  .validator(resolveSourceInput)
  .handler(async ({ data }) => resolveSourceCore(data.url))

/** Form options: the list of candidate companies (vendors). Uses the same listLinkTargets
 * as the candidate form (properties are returned together but sourceFormOptions does not
 * use them. Same shape as videoFormOptions) */
export const sourceFormOptions = createServerFn().handler(async () => {
  const targets = await listLinkTargets()
  return { vendors: targets.vendors }
})
