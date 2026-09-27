/**
 * createServerFn wrappers for fetching the favicon of a vendor's site and for the
 * representative's face photo (import from URL, delete). The actual work is in
 * vendorImagesFetcher.ts (see the comment there for why the files are split). The client
 * (RepresentativePhotoField.tsx, settings.tsx) imports from here.
 */

import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { listVendorsWithWebsite } from './repository'
import {
  deleteRepresentativePhotoObjects,
  deleteVendorFaviconObjects,
  importRepresentativePhotoFromUrlCore,
  refreshAllVendorFavicons,
} from './vendorImagesFetcher'
import {
  importRepresentativePhotoInput,
  refreshVendorFaviconsInput,
  vendorIdInput,
} from './vendorImages.schema'

/** Card list of "候補のサイトアイコン" (site icons of candidates) on the settings screen.
 * Same shape as newsSources (src/server/news.ts) */
export const faviconSources = createServerFn().handler(async () => {
  const vendors = await listVendorsWithWebsite(getDb())
  return { vendors }
})

/** The "アイコンを取得" (fetch icons) / "取り直す" (fetch again) buttons of
 * "候補のサイトアイコン" on the settings screen.
 * Returns { results, processed, remaining } (same shape as refreshAllVendorFavicons). */
export const refreshVendorFavicons = createServerFn({ method: 'POST' })
  .validator(refreshVendorFaviconsInput)
  .handler(async ({ data }) => refreshAllVendorFavicons(getDb(), data))

/** "URL から取り込む" (import from URL) in the vendor form */
export const importRepresentativePhotoFromUrl = createServerFn({ method: 'POST' })
  .validator(importRepresentativePhotoInput)
  .handler(async ({ data }) =>
    importRepresentativePhotoFromUrlCore(getDb(), data.vendorId, data.url),
  )

/** "削除" (delete) in the vendor form (the representative's face photo) */
export const deleteRepresentativePhoto = createServerFn({ method: 'POST' })
  .validator(vendorIdInput)
  .handler(async ({ data }) => deleteRepresentativePhotoObjects(getDb(), data.vendorId))

/** "削除" in the vendor form (the site icon). Upload is multipart, so it is handled by
 * src/routes/api.vendor-favicon.$vendorId.tsx (raw route), not by createServerFn */
export const deleteVendorFavicon = createServerFn({ method: 'POST' })
  .validator(vendorIdInput)
  .handler(async ({ data }) => deleteVendorFaviconObjects(getDb(), data.vendorId))
