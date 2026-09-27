import { z } from 'zod'

import { SOURCE_GENRE_IDS } from '../../content/sourceGenres'

/**
 * Genre filter (`?g=`) of the sources page (/sources). `.catch(undefined)` is added for
 * the same reason as glossarySearchSchema: even when a hand-typed or old bookmarked URL
 * holds an unknown genre id, do not show the error screen; fall back to no filter (all
 * genres shown).
 */
export const sourcesSearchSchema = z.object({
  g: z.enum(SOURCE_GENRE_IDS).optional().catch(undefined),
})

export type SourcesSearch = z.infer<typeof sourcesSearchSchema>
