import { z } from 'zod'

import { idField } from './zod'

/**
 * Why this is split from vendorImages.ts: same as news.schema.ts (see the comment there
 * for details). The createServerFn wrappers in vendorImages.ts
 * (importRepresentativePhotoFromUrl etc.) fail with "No Start context found" when called
 * directly from a plain vitest workers test that has no TanStack Start server runtime, so
 * only the pure zod schemas placed here are validated directly from
 * vendorImages.worker-test.ts.
 */

/** Imports the representative's face photo from a URL (POST /vendorImages
 * importRepresentativePhotoFromUrl). https only + isAllowedRemoteUrl (SSRF protection) is
 * checked a second time right before the actual fetch, but here we also check just the same
 * shape (starts with https://) so the form can reject early. */
export const importRepresentativePhotoInput = z.object({
  vendorId: idField,
  url: z
    .string()
    .trim()
    .min(1, 'URL は必須です')
    .max(1000)
    .refine((v) => /^https:\/\//.test(v), 'URL は https:// で始めてください'),
})
export type ImportRepresentativePhotoInput = z.input<typeof importRepresentativePhotoInput>

/** Fetch button of "候補のサイトアイコン" (site icons of candidates) on the settings screen.
 * force=true means "取り直す" (fetch again; also targets vendors that already have a favicon_key) */
export const refreshVendorFaviconsInput = z.object({ force: z.boolean().default(false) })
export type RefreshVendorFaviconsInput = z.input<typeof refreshVendorFaviconsInput>

export const vendorIdInput = z.object({ vendorId: idField })
export type VendorIdInput = z.input<typeof vendorIdInput>
