import { z } from 'zod'

import { RESEARCH_FACT_KEYS } from '../lib/research'
import { dateField, idField, numberOrEmpty } from './zod'

/**
 * 調査メモ・建築計画の zod。research.ts から分離しているのは candidates.schema.ts と同じ理由
 * （createServerFn のラッパーを素の workers テストから import できないため。詳細はそちら）。
 */

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https:\/\//.test(v), 'URL は https:// で始めてください')

/** facts は値の無いキー（空文字）を落として保存する（比較表・詳細が空行を出さないため） */
export const vendorResearchInput = z.object({
  version: z.literal(1),
  researchedOn: dateField,
  summary: z.string().trim().max(300),
  facts: z
    .partialRecord(z.enum(RESEARCH_FACT_KEYS), z.string().trim().max(1000))
    .default({})
    .transform((facts) =>
      Object.fromEntries(Object.entries(facts).filter(([, v]) => v !== undefined && v !== '')),
    ),
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(1, '見出しは必須です').max(60),
        body: z.string().trim().min(1, '本文は必須です').max(6000),
      }),
    )
    .max(30),
  sources: z
    .array(
      z.object({ label: z.string().trim().min(1, '出典名は必須です').max(120), url: httpsUrl }),
    )
    .max(40),
})
export type VendorResearchInput = z.infer<typeof vendorResearchInput>

export const saveVendorResearchInput = z.object({
  id: idField,
  /** null で調査メモを消す */
  research: vendorResearchInput.nullable(),
})

export const buildPlanInput = z
  .object({
    floors: z.union([z.literal(1), z.literal(2)]),
    tsuboMin: z.number().int().min(5).max(300),
    tsuboMax: z.number().int().min(5).max(300),
    budgetManYen: numberOrEmpty(z.number().int().min(0).max(1_000_000)),
  })
  .refine((v) => v.tsuboMin <= v.tsuboMax, {
    message: '坪数は下限≦上限にしてください',
    path: ['tsuboMax'],
  })
export type BuildPlanInput = z.infer<typeof buildPlanInput>
