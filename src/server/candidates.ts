import { createServerFn } from '@tanstack/react-start'
import { asc, eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { CANDIDATE_STATUSES, statusRank } from '../lib/status'
import { matchesHomeAreas } from '../lib/serviceArea'
import { places, properties, vendors } from '../db/schema'
import { propertyInput, vendorInput } from './candidates.schema'
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
  saveOrConflict,
} from './repository'
import { SAVE_FAVICON_BUDGET, fetchFaviconForVendor } from './vendorImagesFetcher'
import { idInput } from './zod'

export { propertyInput, vendorInput }
export type { PropertyInput, VendorInput } from './candidates.schema'

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
    const saved = await saveOrConflict(async () =>
      upsertVendor(db, data, await currentActorEmail()),
    )
    if (saved.conflict) return saved
    const id = saved.id
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
    return saved
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
