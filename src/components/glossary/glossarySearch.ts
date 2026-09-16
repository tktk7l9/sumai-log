import { z } from 'zod'

import { GLOSSARY_CATEGORIES, type CategoryId } from '../../content/glossary'

export const CATEGORY_IDS = GLOSSARY_CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]]

/**
 * 用語集の検索条件（キーワード・分類）。`/glossary`（一覧）と `/glossary/$termId`
 * （詳細）の両方の `validateSearch` で共有する。一覧→詳細→一覧と行き来しても
 * 検索・絞り込みが消えないよう、遷移のたびにこの形で引き継ぐ。
 */
export const glossarySearchSchema = z.object({
  // 手打ち／短縮された URL（例: `/glossary?q=35`）はルーターの qss デコードが
  // 数値・真偽値に変換してから渡してくる。`z.string()` 単体だと throw して
  // エラー画面になるので、数値も文字列として受けたうえで検索語に使う
  // （`?q=35` は「35」を検索する。それ以外の変換不能な値は絞り込み無しに倒す）。
  q: z.union([z.string(), z.number()]).transform(String).optional().catch(undefined),
  c: z.enum(CATEGORY_IDS).optional().catch(undefined),
})

export type GlossarySearch = z.infer<typeof glossarySearchSchema>
