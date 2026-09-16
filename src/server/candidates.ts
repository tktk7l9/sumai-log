import { createServerFn } from '@tanstack/react-start'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '../db/client'
import { AFFILIATION_IDS, AFFILIATIONS } from '../content/affiliations'
import { CANDIDATE_STATUSES, statusRank } from '../lib/status'
import { isAllowedNewsUrl } from '../lib/news/url'
import { matchesHomeAreas } from '../lib/serviceArea'
import { normalizeSocialUrls } from '../lib/social'
import { NEWS_SOURCES, VENDOR_KINDS, places, properties, vendors } from '../db/schema'
import { currentActorEmail } from './members'
import {
  countPlacesByVendor,
  deletePropertyCascade,
  deleteVendorCascade,
  getVendorFaviconSource,
  getVendorWebsiteUrl,
  readHomeAreas,
  upsertProperty,
  upsertVendor,
} from './repository'
import { SAVE_FAVICON_BUDGET, fetchFaviconForVendor } from './vendorImagesFetcher'
import {
  idField,
  idInput,
  numberOrEmpty,
  optionalHttpsUrl,
  optionalInt,
  optionalText,
  optionalUrl,
} from './zod'

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

export const listCandidates = createServerFn().handler(async () => {
  const db = getDb()
  const [vendorRows, propertyRows, homeAreas, placeCounts] = await Promise.all([
    db.select().from(vendors).orderBy(asc(vendors.name)),
    db.select().from(properties).orderBy(asc(properties.name)),
    readHomeAreas(db),
    countPlacesByVendor(db),
  ])
  const byStatus = <T extends { status: (typeof CANDIDATE_STATUSES)[number] }>(a: T, b: T) =>
    statusRank(a.status) - statusRank(b.status)
  return {
    homeAreas,
    vendors: vendorRows
      .map((v) => ({
        ...v,
        coversHome: matchesHomeAreas(v.serviceAreas, homeAreas),
        placeCount: placeCounts.get(v.id) ?? 0,
      }))
      .sort(byStatus),
    properties: propertyRows.sort(byStatus),
  }
})

export const getVendor = createServerFn()
  .validator(idInput)
  .handler(async ({ data }) => {
    const db = getDb()
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, data.id)).limit(1)
    if (!vendor) throw new Response('Not Found', { status: 404 })
    const [placeRows, homeAreas] = await Promise.all([
      db.select().from(places).where(eq(places.vendorId, data.id)).orderBy(asc(places.name)),
      readHomeAreas(db),
    ])
    return {
      vendor,
      places: placeRows,
      coversHome: matchesHomeAreas(vendor.serviceAreas, homeAreas),
    }
  })

export const saveVendor = createServerFn({ method: 'POST' })
  .validator(vendorInput)
  .handler(async ({ data }) => {
    const db = getDb()
    // websiteUrl が新規/変更されたときだけファビコンを取りに行く（design 通り）。
    // 既存の websiteUrl と同じなら毎回叩き直さない。favicon_source が 'manual'（業者フォームの
    // 手動アップロード）の業者は対象外にする（refreshAllVendorFavicons の非 force と同じ方針。
    // 手動アップロードした直後に websiteUrl 以外のフィールドを保存しただけで自動取得に
    // 上書きされてしまうのを防ぐ）。取得は fetchFaviconForVendor 自身が例外を投げない設計
    // だが、念のため .catch で保存自体は必ず成功させる。保存を長時間ブロックしないよう、
    // ここだけ短い予算（SAVE_FAVICON_BUDGET。最悪 8 秒）で呼ぶ。ここで見つからなくても
    // 設定画面の「アイコンを取得」（フルの予算）で拾える。
    const previousWebsiteUrl = data.id ? await getVendorWebsiteUrl(db, data.id) : null
    const previousFaviconSource = data.id ? await getVendorFaviconSource(db, data.id) : null
    const id = await upsertVendor(db, data, await currentActorEmail())
    if (
      data.websiteUrl &&
      data.websiteUrl !== previousWebsiteUrl &&
      previousFaviconSource !== 'manual'
    ) {
      await fetchFaviconForVendor(
        db,
        id,
        data.websiteUrl,
        undefined,
        undefined,
        SAVE_FAVICON_BUDGET,
      ).catch(() => {})
    }
    return { id }
  })

export const deleteVendor = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    await deleteVendorCascade(getDb(), data.id)
    return { ok: true as const }
  })

export const getProperty = createServerFn()
  .validator(idInput)
  .handler(async ({ data }) => {
    const db = getDb()
    const [property] = await db.select().from(properties).where(eq(properties.id, data.id)).limit(1)
    if (!property) throw new Response('Not Found', { status: 404 })
    const placeRows = await db.select().from(places).where(eq(places.propertyId, data.id))
    return { property, places: placeRows }
  })

export const saveProperty = createServerFn({ method: 'POST' })
  .validator(propertyInput)
  .handler(async ({ data }) => ({
    id: await upsertProperty(getDb(), data, await currentActorEmail()),
  }))

export const deleteProperty = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    await deletePropertyCascade(getDb(), data.id)
    return { ok: true as const }
  })
