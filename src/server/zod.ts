import { z } from 'zod'

import { emptyToNull } from '../lib/emptyToNull'
import { UUID_SHAPE } from '../lib/ids'

export const idField = z.string().regex(UUID_SHAPE, 'id の形式が不正です')
export const idInput = z.object({ id: idField })

export const optionalText = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (v === '' ? null : v))
  .nullable()

export const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .refine((v) => v === null || /^https?:\/\//.test(v), 'URL は http(s):// で始めてください')

/** Mantine の NumberInput は空欄で '' を emit する。境界で null に直す */
export const numberOrEmpty = <T extends z.ZodNumber>(schema: T) =>
  z
    .union([schema, z.literal('')])
    .transform(emptyToNull)
    .nullable()
export const optionalInt = numberOrEmpty(z.number().int())

export const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD')
export const timeField = z.string().regex(/^\d{2}:\d{2}$/, '時刻は HH:MM')
