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
import { assertUpdated } from './stale'

type VendorInput = Omit<NewVendor, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & {
  id?: string
  expectedUpdatedAt?: string | null
}

/** Creates when there is no id, updates when there is. The creator is recorded only on the first save */
export async function upsertVendor(
  db: Db,
  input: VendorInput,
  actorEmail: string,
): Promise<string> {
  const { id, expectedUpdatedAt, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(vendors).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  const rows = await db
    .update(vendors)
    .set({ ...values, updatedAt: sql`(datetime('now'))` })
    .where(
      expectedUpdatedAt
        ? and(eq(vendors.id, id), eq(vendors.updatedAt, expectedUpdatedAt))
        : eq(vendors.id, id),
    )
    .returning({ id: vendors.id })
  assertUpdated(rows, expectedUpdatedAt)
  return id
}

/** Deletes a vendor. FK SET NULL detaches vendorId on places/events/visits/videos. Comments are deleted */
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
 * Whether the vendor really exists. Call it before writing to or deleting from R2 (because
 * a write/delete against a non-existent id leaves orphan objects, and a 0-row update goes
 * unnoticed). The same check as the upload path of `api.vendor-photos.$vendorId.tsx` is
 * extracted here and also used for URL import and deletion.
 */
export async function vendorExists(db: Db, id: string): Promise<boolean> {
  const [row] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, id)).limit(1)
  return row !== undefined
}

/**
 * Replaces favicon_key / favicon_source without touching vendors.updated_at. Same reason as
 * markNewsFetched (repository/news.ts): avoid the vendor surfacing in the home
 * "最近の更新" (Recent updates) feed on every automatic fetch. The return value is the
 * favicon_key before the replacement (null if none). The caller can use it to delete the
 * old R2 object.
 *
 * `source` is stated explicitly by the caller: automatic fetch (fetchFaviconForVendor) is
 * 'auto', manual upload from the vendor form (uploadVendorFaviconCore) is 'manual', and
 * deletion (deleteVendorFaviconObjects) passes null together with key to clear both.
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
 * The current value of favicon_source. For the inline fetch guard of saveVendor
 * (candidates.ts): after a manual upload, automatic fetch does not overwrite it even if
 * websiteUrl changes (same policy as the non-force refreshAllVendorFavicons).
 */
export async function getVendorFaviconSource(db: Db, id: string): Promise<FaviconSource | null> {
  const [row] = await db
    .select({ faviconSource: vendors.faviconSource })
    .from(vendors)
    .where(eq(vendors.id, id))
    .limit(1)
  return row?.faviconSource ?? null
}

/** The representative_photo_key version. Same policy as setVendorFaviconKey (updated_at is not touched) */
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
 * For "候補のサイトアイコン" (Candidate site icons) on the settings screen. Only vendors
 * that have website_url (the force decision is the caller's). `faviconSource` is used by
 * refreshAllVendorFavicons to exclude 'manual' vendors when not force. `newsFetchError`:
 * the automatic favicon fetch often fails too for the same vendor and the same rejection
 * reason as the vendor news fetch (a server that rejects the Cloudflare IP ranges across
 * the board), so the card on the settings screen uses it to show the same wording by
 * reusing `describeFetchError` (src/lib/news/errors.ts) (the favicon fetch itself returns
 * only success or failure and has no separate column that stores a reason with the HTTP
 * status, so the result of the vendor news fetch is used as a clue). However, news_url and
 * website_url can be on different hosts, so `newsUrl` is returned as well. The caller
 * (settings.tsx) shows this hint only when `sameHost(newsUrl, websiteUrl)`
 * (src/lib/news/url.ts) is true (a response to the PR #12 review comment that on a
 * different host it is only a guess).
 */
export async function listVendorsWithWebsite(
  db: Db,
): Promise<
  Pick<
    Vendor,
    'id' | 'name' | 'websiteUrl' | 'newsUrl' | 'faviconKey' | 'faviconSource' | 'newsFetchError'
  >[]
> {
  return db
    .select({
      id: vendors.id,
      name: vendors.name,
      websiteUrl: vendors.websiteUrl,
      newsUrl: vendors.newsUrl,
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

/** Deletes a property. Comments are deleted */
export async function deletePropertyCascade(db: Db, id: string): Promise<void> {
  await db
    .delete(comments)
    .where(and(eq(comments.targetType, 'property'), eq(comments.targetId, id)))
  await db.delete(properties).where(eq(properties.id, id))
}
