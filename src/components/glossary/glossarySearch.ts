import { z } from 'zod'

import { GLOSSARY_CATEGORIES, type CategoryId } from '../../content/glossary'

export const CATEGORY_IDS = GLOSSARY_CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]]

/**
 * Search conditions for the glossary (keyword, category). Shared by the `validateSearch`
 * of both `/glossary` (list) and `/glossary/$termId` (detail). Carried over in this shape
 * on every navigation, so the search and filter survive going list -> detail -> list.
 */
export const glossarySearchSchema = z.object({
  // For a hand-typed or shortened URL (e.g. `/glossary?q=35`), the router's qss decoding
  // converts the value to a number or boolean before passing it in. `z.string()` alone
  // throws and shows the error screen, so numbers are accepted as strings too and used as
  // the search term (`?q=35` searches for "35"; any other unconvertible value falls back
  // to no filter).
  q: z.union([z.string(), z.number()]).transform(String).optional().catch(undefined),
  c: z.enum(CATEGORY_IDS).optional().catch(undefined),
})

export type GlossarySearch = z.infer<typeof glossarySearchSchema>
