import { z } from 'zod'

import { emptyToNull } from '../lib/emptyToNull'
import { UUID_SHAPE } from '../lib/ids'
import { isAllowedNewsUrl } from '../lib/news/url'

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

/**
 * Vendor news URL (the source; the target of the fetch). As the policy in design.md §5
 * says, only https is allowed (http is not). It also goes through the hostname check for
 * SSRF protection in isAllowedNewsUrl (src/lib/news/url.ts) (IP literals, localhost,
 * internal-facing domains etc. are rejected). The form rejects early (the first layer of
 * the defense in depth before the actual fetch).
 */
export const optionalHttpsUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .refine((v) => v === null || /^https:\/\//.test(v), 'URL は https:// で始めてください')
  .refine((v) => v === null || isAllowedNewsUrl(v), 'URL が許可されていません')

/** Mantine's NumberInput emits '' when empty. Convert it to null at the boundary */
export const numberOrEmpty = <T extends z.ZodNumber>(schema: T) =>
  z
    .union([schema, z.literal('')])
    .transform(emptyToNull)
    .nullable()
export const optionalInt = numberOrEmpty(z.number().int())

export const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD')
export const timeField = z.string().regex(/^\d{2}:\d{2}$/, '時刻は HH:MM')
