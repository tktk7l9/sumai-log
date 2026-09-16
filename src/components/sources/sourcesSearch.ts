import { z } from 'zod'

import { SOURCE_GENRE_IDS } from '../../content/sourceGenres'

/**
 * 情報収集ページ（/sources）のジャンル絞り込み（`?g=`）。glossarySearchSchema と同じ
 * 理由で `.catch(undefined)` を付ける: 手打ち／古いブックマークされた URL に未知の
 * ジャンル id が入っていてもエラー画面にせず、絞り込み無し（全ジャンル表示）に倒す。
 */
export const sourcesSearchSchema = z.object({
  g: z.enum(SOURCE_GENRE_IDS).optional().catch(undefined),
})

export type SourcesSearch = z.infer<typeof sourcesSearchSchema>
