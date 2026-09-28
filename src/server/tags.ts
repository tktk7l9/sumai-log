import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDb } from '../db/client'
import { listTags, replaceTags, seedDefaultTags } from './repository'

/** Used by the tag editor in the settings tab and by the suggestions in the video form.
 * Seeds the default tags on first access */
export const listTagNames = createServerFn().handler(async () => {
  const db = getDb()
  await seedDefaultTags(db)
  const rows = await listTags(db)
  return rows.map((r) => r.name)
})

export const tagsInput = z.object({
  // Allowing 0 entries would make seedDefaultTags fire again on the next access (so the UI
  // cannot express "delete them all")
  names: z.array(z.string().trim().min(1).max(30)).min(1, 'タグは 1 つ以上必要です').max(100),
})

export const saveTags = createServerFn({ method: 'POST' })
  .validator(tagsInput)
  .handler(async ({ data }) => {
    await replaceTags(getDb(), data.names)
    return { ok: true as const }
  })
