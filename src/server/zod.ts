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
 * 業者のお知らせ URL（取得先。fetch する対象）。design.md §5 の方針どおり https のみ
 * 許可（http は不可）。さらに isAllowedNewsUrl（src/lib/news/url.ts）で SSRF 対策の
 * ホスト名チェックも通す（IP リテラル・localhost・内部向けドメイン等は拒否）。
 * フォーム側で早めに弾く（実際の fetch 前の多層防御の一枚目）。
 */
export const optionalHttpsUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .refine((v) => v === null || /^https:\/\//.test(v), 'URL は https:// で始めてください')
  .refine((v) => v === null || isAllowedNewsUrl(v), 'URL が許可されていません')

/** Mantine の NumberInput は空欄で '' を emit する。境界で null に直す */
export const numberOrEmpty = <T extends z.ZodNumber>(schema: T) =>
  z
    .union([schema, z.literal('')])
    .transform(emptyToNull)
    .nullable()
export const optionalInt = numberOrEmpty(z.number().int())

export const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD')
export const timeField = z.string().regex(/^\d{2}:\d{2}$/, '時刻は HH:MM')
