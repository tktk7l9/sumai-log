import { z } from 'zod'

import { AFFILIATION_IDS, AFFILIATIONS } from '../content/affiliations'
import { CANDIDATE_STATUSES } from '../lib/status'
import { normalizeDomains } from '../lib/mail/match'
import { isAllowedNewsUrl } from '../lib/news/url'
import { normalizeSocialUrls } from '../lib/social'
import { NEWS_SOURCES, VENDOR_KINDS } from '../db/schema'
import {
  idField,
  numberOrEmpty,
  optionalHttpsUrl,
  optionalInt,
  optionalText,
  optionalUrl,
} from './zod'

/**
 * candidates.ts から分離した理由: events.schema.ts / videos.schema.ts と同じ
 * （詳細はそちらのコメント参照）。candidates.ts は saveVendor / saveProperty の中で
 * currentActorEmail（`@tanstack/react-start/server` の getRequest を静的 import）を
 * 使っており、素の vitest workers テストから candidates.ts を import 経由で
 * 読み込むと TanStack Start の Vite プラグインが用意する virtual specifier の解決に
 * 失敗して落ちる。vendorInput・propertyInput 自体は D1 も members も要らない純粋な
 * zod スキーマなので、ここへ切り出して candidates.worker-test.ts はこちらから
 * import する（candidates.ts は再エクスポートするだけで、公開している import パス・
 * 挙動は変えない）。
 */

export const vendorInput = z
  .object({
    id: idField.optional(),
    name: z.string().trim().min(1, '名前は必須です').max(200),
    kind: z.enum(VENDOR_KINDS),
    hq: optionalText,
    // optionalText はヘルパの形固定（max 2000）のためここでは使えない（videos.schema.ts と同じ理由）。
    representative: z
      .string()
      .trim()
      .max(60)
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .optional(),
    serviceAreas: z.array(z.string().trim().min(1).max(50)).max(100),
    affiliations: z
      .array(z.enum(AFFILIATION_IDS))
      .max(AFFILIATIONS.length)
      .default([])
      .transform((arr) => Array.from(new Set(arr))),
    // 加盟団体ごとの紹介ページ URL・メモ。キーは affiliations と同じ Affiliation['id']
    // （partialRecord なので選ばなかった団体のキーは無くてよい）。url は
    // optionalHttpsUrl と同じ判定（https のみ・isAllowedNewsUrl で SSRF 対策）だが
    // こちらは必須（キーがある以上 URL は要る）
    affiliationLinks: z
      .partialRecord(
        z.enum(AFFILIATION_IDS),
        z.object({
          url: z
            .string()
            .trim()
            .max(500)
            .refine((v) => /^https:\/\//.test(v), 'URL は https:// で始めてください')
            .refine(isAllowedNewsUrl, 'URL が許可されていません'),
          note: z
            .string()
            .trim()
            .max(60)
            .transform((v) => (v === '' ? undefined : v))
            .optional(),
        }),
      )
      .default({}),
    uaValue: numberOrEmpty(z.number().min(0).max(5)),
    cValuePublished: z.boolean(),
    seismicGrade: numberOrEmpty(z.number().int().min(1).max(3)),
    longTermCertified: z.boolean(),
    pricePerTsuboMin: optionalInt,
    pricePerTsuboMax: optionalInt,
    structure: optionalText,
    features: optionalText,
    status: z.enum(CANDIDATE_STATUSES),
    sourceUrl: optionalUrl,
    websiteUrl: optionalUrl,
    socialUrls: z.array(z.string().trim().max(500)).max(200).transform(normalizeSocialUrls),
    // お知らせの取得元。URL を空にしたら方式も一緒に null へ戻す（design.md §1）。
    newsUrl: optionalHttpsUrl,
    newsSource: z.enum(NEWS_SOURCES).nullable(),
    // メール取込（設計 2026-09-19）: メルマガの差出人ドメイン。保存時に小文字・カンマ区切りへ正規化
    newsEmailDomain: z.string().max(500).nullable().transform(normalizeDomains),
  })
  .transform((v) => ({ ...v, newsSource: v.newsUrl ? v.newsSource : null }))
export type VendorInput = z.infer<typeof vendorInput>

export const propertyInput = z.object({
  id: idField.optional(),
  name: z.string().trim().min(1, '名前は必須です').max(200),
  address: optionalText,
  station: optionalText,
  walkMinutes: optionalInt,
  price: optionalInt,
  areaSqm: numberOrEmpty(z.number().min(0)),
  layout: optionalText,
  builtYear: optionalInt,
  completionDate: optionalText,
  managementFee: optionalInt,
  repairReserve: optionalInt,
  listingUrl: optionalUrl,
  note: optionalText,
  status: z.enum(CANDIDATE_STATUSES),
})
export type PropertyInput = z.infer<typeof propertyInput>
