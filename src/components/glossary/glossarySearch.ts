import { z } from 'zod'

import { GLOSSARY_CATEGORIES, type CategoryId } from '../../content/glossary'

export const CATEGORY_IDS = GLOSSARY_CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]]

/**
 * 用語集の検索条件（キーワード・分類）。`/glossary`（一覧）と `/glossary/$termId`
 * （詳細）の両方の `validateSearch` で共有する。一覧→詳細→一覧と行き来しても
 * 検索・絞り込みが消えないよう、遷移のたびにこの形で引き継ぐ。
 */
export const glossarySearchSchema = z.object({
  q: z.string().optional(),
  c: z.enum(CATEGORY_IDS).optional(),
})

export type GlossarySearch = z.infer<typeof glossarySearchSchema>
