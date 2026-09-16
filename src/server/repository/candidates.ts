import { and, eq, isNotNull, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import {
  comments,
  properties,
  vendors,
  type NewProperty,
  type NewVendor,
  type Vendor,
} from '../../db/schema'

type VendorInput = Omit<NewVendor, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & { id?: string }

/** id が無ければ作成、あれば更新。作成者は最初の保存時だけ記録する */
export async function upsertVendor(
  db: Db,
  input: VendorInput,
  actorEmail: string,
): Promise<string> {
  const { id, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(vendors).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  await db
    .update(vendors)
    .set({ ...values, updatedAt: sql`(datetime('now'))` })
    .where(eq(vendors.id, id))
  return id
}

/** 業者を消す。場所・予定・見学・動画の vendorId は FK の SET NULL で外れる。コメントは消す */
export async function deleteVendorCascade(db: Db, id: string): Promise<void> {
  await db.delete(comments).where(and(eq(comments.targetType, 'vendor'), eq(comments.targetId, id)))
  await db.delete(vendors).where(eq(vendors.id, id))
}

export async function getVendorWebsiteUrl(db: Db, id: string): Promise<string | null> {
  const [row] = await db
    .select({ websiteUrl: vendors.websiteUrl })
    .from(vendors)
    .where(eq(vendors.id, id))
    .limit(1)
  return row?.websiteUrl ?? null
}

/**
 * 業者が実在するか。R2 へ書き込む・消す前に呼ぶ（存在しない id に対して write/delete すると
 * 孤児オブジェクトが残る・0 行更新で気づけないため）。`api.vendor-photos.$vendorId.tsx` の
 * アップロード経路と同じ判定をここに切り出し、URL 取り込み・削除でも使う。
 */
export async function vendorExists(db: Db, id: string): Promise<boolean> {
  const [row] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, id)).limit(1)
  return row !== undefined
}

/**
 * favicon_key を vendors.updated_at を動かさずに差し替える。markNewsFetched
 * （repository/news.ts）と同じ理由: 自動取得のたびにホームの「最近の更新」フィードへ
 * 業者が浮上してしまうのを避ける。戻り値は差し替え前の値（無ければ null）。
 * 呼び出し側はこれを使って古い R2 オブジェクトを消せる。
 */
export async function setVendorFaviconKey(
  db: Db,
  id: string,
  key: string | null,
): Promise<string | null> {
  const [before] = await db
    .select({ faviconKey: vendors.faviconKey })
    .from(vendors)
    .where(eq(vendors.id, id))
    .limit(1)
  await db.update(vendors).set({ faviconKey: key }).where(eq(vendors.id, id))
  return before?.faviconKey ?? null
}

/** representative_photo_key 版。setVendorFaviconKey と同じ方針（updated_at は動かさない） */
export async function setVendorRepresentativePhotoKey(
  db: Db,
  id: string,
  key: string | null,
): Promise<string | null> {
  const [before] = await db
    .select({ representativePhotoKey: vendors.representativePhotoKey })
    .from(vendors)
    .where(eq(vendors.id, id))
    .limit(1)
  await db.update(vendors).set({ representativePhotoKey: key }).where(eq(vendors.id, id))
  return before?.representativePhotoKey ?? null
}

/** 設定画面「候補のサイトアイコン」用。website_url がある業者のみ（force 判定は呼び出し側） */
export async function listVendorsWithWebsite(
  db: Db,
): Promise<Pick<Vendor, 'id' | 'name' | 'websiteUrl' | 'faviconKey'>[]> {
  return db
    .select({
      id: vendors.id,
      name: vendors.name,
      websiteUrl: vendors.websiteUrl,
      faviconKey: vendors.faviconKey,
    })
    .from(vendors)
    .where(isNotNull(vendors.websiteUrl))
}

type PropertyInput = Omit<NewProperty, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & {
  id?: string
}

export async function upsertProperty(
  db: Db,
  input: PropertyInput,
  actorEmail: string,
): Promise<string> {
  const { id, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(properties).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  await db
    .update(properties)
    .set({ ...values, updatedAt: sql`(datetime('now'))` })
    .where(eq(properties.id, id))
  return id
}

/** 物件を消す。コメントは消す */
export async function deletePropertyCascade(db: Db, id: string): Promise<void> {
  await db
    .delete(comments)
    .where(and(eq(comments.targetType, 'property'), eq(comments.targetId, id)))
  await db.delete(properties).where(eq(properties.id, id))
}
