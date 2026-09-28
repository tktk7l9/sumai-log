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
 * Why this is split from candidates.ts: the same as events.schema.ts / videos.schema.ts
 * (see the comments there for details). candidates.ts uses currentActorEmail (which
 * statically imports getRequest of `@tanstack/react-start/server`) inside saveVendor /
 * saveProperty, and loading candidates.ts through import from a plain vitest workers test
 * fails to resolve the virtual specifier provided by the TanStack Start Vite plugin and
 * crashes. vendorInput and propertyInput themselves are pure zod schemas that need neither
 * D1 nor members, so they are extracted here and candidates.worker-test.ts imports from this
 * file (candidates.ts only re-exports, and the public import path and behaviour do not
 * change).
 */

export const vendorInput = z
  .object({
    id: idField.optional(),
    // The updated-at at the time of opening. If the other person saved first, return a conflict
    // instead of overwriting (repository/stale.ts)
    expectedUpdatedAt: z.string().max(40).nullish(),
    name: z.string().trim().min(1, '名前は必須です').max(200),
    kind: z.enum(VENDOR_KINDS),
    hq: optionalText,
    // optionalText cannot be used here because the helper has a fixed shape (max 2000) (same
    // reason as videos.schema.ts).
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
    // Profile page URL and note per affiliated organisation. The key is Affiliation['id'], the
    // same as affiliations (it is a partialRecord, so keys of organisations not chosen may be
    // absent). url uses the same check as optionalHttpsUrl (https only, SSRF protection through
    // isAllowedNewsUrl), but here it is required (as long as the key exists, a URL is needed)
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
    // The source of the vendor news. When the URL is emptied, the method goes back to null
    // together with it (design.md §1).
    newsUrl: optionalHttpsUrl,
    newsSource: z.enum(NEWS_SOURCES).nullable(),
    // Mail import (design 2026-09-19): the sender domain of the newsletter. Normalised to
    // lowercase, comma separated on save
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
