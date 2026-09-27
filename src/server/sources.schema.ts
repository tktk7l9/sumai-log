import { z } from 'zod'

import { AFFILIATION_IDS } from '../content/affiliations'
import { SOURCE_GENRE_IDS } from '../content/sourceGenres'
import { isAllowedRemoteUrl } from '../lib/news/url'
import { isAllowedAvatarUrl, parseYoutubeChannelUrl } from '../lib/sources'
import { idField } from './zod'

/**
 * Reason for the split from sources.ts: same as events.schema.ts (inside saveSource,
 * sources.ts statically imports getRequest of `@tanstack/react-start/server` via
 * currentActorEmail, and that hits a virtual specifier that cannot be resolved from a
 * plain vitest workers test and fails. sourceInput/resolveSourceInput themselves are pure
 * zod schemas that need neither D1 nor members, so they are extracted here. sources.ts
 * only re-exports them, and the public import path (sourceInput/SourceInput can be taken
 * from './sources') does not change).
 */

const URL_MAX = 500
const NAME_MAX = 200
const DESCRIPTION_MAX = 200
const HANDLE_MAX = 100

/** The URL of a source (an external link; for a YouTube channel it also becomes a target
 * fetched by "取得" (Fetch)). https only (aligned with the same rule as validateSource in
 * seed.mjs). In addition isAllowedRemoteUrl (the hostname check of the SSRF guard) is
 * applied on save too. The site kind is not fetched by "取得", but the same check is
 * applied here as well, because it may be fetched in the future and to align the entry
 * points on one rule. */
export const sourceUrl = z
  .string()
  .trim()
  .min(1, 'URL は必須です')
  .max(URL_MAX)
  .refine((v) => /^https:\/\//.test(v), 'URL は https:// で始めてください')
  .refine((v) => isAllowedRemoteUrl(v), 'URL が許可されていません')

const trimmedOptional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()

export const sourceInput = z
  .object({
    id: idField.optional(),
    url: sourceUrl,
    name: z.string().trim().min(1, '名前は必須です').max(NAME_MAX),
    genre: z.enum(SOURCE_GENRE_IDS),
    description: trimmedOptional(DESCRIPTION_MAX),
    handle: trimmedOptional(HANDLE_MAX),
    channelId: trimmedOptional(HANDLE_MAX),
    avatarUrl: trimmedOptional(URL_MAX),
    vendorId: idField.nullable(),
    affiliation: z.enum(AFFILIATION_IDS).nullable(),
    sortOrder: z.number().int(),
  })
  .transform((v) => ({
    ...v,
    // kind is not chosen in the form; it is determined automatically from the URL (per the brief).
    kind: parseYoutubeChannelUrl(v.url) ? ('youtube' as const) : ('site' as const),
    // Even if an avatarUrl outside the host allowlist is ever sent, drop it silently
    // (no double check at display time)
    avatarUrl: v.avatarUrl && isAllowedAvatarUrl(v.avatarUrl) ? v.avatarUrl : null,
  }))
export type SourceInput = z.input<typeof sourceInput>

export const resolveSourceInput = z.object({ url: sourceUrl })
export type ResolveSourceInput = z.input<typeof resolveSourceInput>
