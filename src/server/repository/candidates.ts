import { and, eq, isNotNull, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import {
  comments,
  properties,
  vendors,
  type FaviconSource,
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
 * favicon_key / favicon_source を vendors.updated_at を動かさずに差し替える。markNewsFetched
 * （repository/news.ts）と同じ理由: 自動取得のたびにホームの「最近の更新」フィードへ
 * 業者が浮上してしまうのを避ける。戻り値は差し替え前の favicon_key（無ければ null）。
 * 呼び出し側はこれを使って古い R2 オブジェクトを消せる。
 *
 * `source` は呼び出し側が明示する: 自動取得（fetchFaviconForVendor）は 'auto'、業者フォームの
 * 手動アップロード（uploadVendorFaviconCore）は 'manual'、削除（deleteVendorFaviconObjects）は
 * key と一緒に null を渡して両方クリアする。
 */
export async function setVendorFaviconKey(
  db: Db,
  id: string,
  key: string | null,
  source: FaviconSource | null,
): Promise<string | null> {
  const [before] = await db
    .select({ faviconKey: vendors.faviconKey })
    .from(vendors)
    .where(eq(vendors.id, id))
    .limit(1)
  await db.update(vendors).set({ faviconKey: key, faviconSource: source }).where(eq(vendors.id, id))
  return before?.faviconKey ?? null
}

/**
 * favicon_source の現在値。saveVendor（candidates.ts）のインライン取得ガード用:
 * 手動アップロード後は websiteUrl が変わっても自動取得で上書きしない
 * （非 force の refreshAllVendorFavicons と同じ方針）。
 */
export async function getVendorFaviconSource(db: Db, id: string): Promise<FaviconSource | null> {
  const [row] = await db
    .select({ faviconSource: vendors.faviconSource })
    .from(vendors)
    .where(eq(vendors.id, id))
    .limit(1)
  return row?.faviconSource ?? null
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

/**
 * 設定画面「候補のサイトアイコン」用。website_url がある業者のみ（force 判定は呼び出し側）。
 * `faviconSource` は refreshAllVendorFavicons が非 force のとき 'manual' の業者を除外するために
 * 使う。`newsFetchError` はお知らせ取得と同じ業者・同じ拒否理由（Cloudflare の IP レンジを
 * 一律拒否するサーバー）でファビコンの自動取得も失敗していることが多いため、設定画面の
 * カードで `describeFetchError`（src/lib/news/errors.ts）を使い回して同じ文言を出すのに使う
 * （ファビコン取得自体は成否だけを返し、HTTP ステータスつきの理由を保存する列を別途
 * 持っていないため、業者のお知らせの取得結果を手がかりにする）。
 */
export async function listVendorsWithWebsite(
  db: Db,
): Promise<
  Pick<Vendor, 'id' | 'name' | 'websiteUrl' | 'faviconKey' | 'faviconSource' | 'newsFetchError'>[]
> {
  return db
    .select({
      id: vendors.id,
      name: vendors.name,
      websiteUrl: vendors.websiteUrl,
      faviconKey: vendors.faviconKey,
      faviconSource: vendors.faviconSource,
      newsFetchError: vendors.newsFetchError,
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
