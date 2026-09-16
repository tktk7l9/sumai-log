import { z } from 'zod'

import { AFFILIATION_IDS } from '../content/affiliations'
import { SOURCE_GENRE_IDS } from '../content/sourceGenres'
import { isAllowedRemoteUrl } from '../lib/news/url'
import { isAllowedAvatarUrl, parseYoutubeChannelUrl } from '../lib/sources'
import { idField } from './zod'

/**
 * sources.ts から分離した理由: events.schema.ts と同じ（sources.ts は saveSource の中で
 * currentActorEmail 経由で `@tanstack/react-start/server` の getRequest を静的 import して
 * おり、それが素の vitest workers テストからは解決できない virtual specifier を踏んで
 * 落ちるため。sourceInput/resolveSourceInput 自体は D1 も members も要らない純粋な zod
 * スキーマなのでここへ切り出す。sources.ts は再エクスポートするだけで、公開 import パス
 * （'./sources' から sourceInput/SourceInput を取れる）は変えない）。
 */

const URL_MAX = 500
const NAME_MAX = 200
const DESCRIPTION_MAX = 200
const HANDLE_MAX = 100

/** 情報源の URL（外部リンク・YouTube チャンネルなら「取得」で fetch する対象にもなる）。
 * https のみ（seed.mjs の validateSource と同じ規則に揃える）。さらに isAllowedRemoteUrl
 * （SSRF 対策のホスト名チェック）も保存時にかける。site 種別は「取得」で fetch されないが、
 * 将来 fetch する可能性・入口をひとつの規則に揃える目的で、ここでも同じ判定を通す。 */
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
    // kind はフォームでは選ばせず、URL から自動判定する（brief どおり）。
    kind: parseYoutubeChannelUrl(v.url) ? ('youtube' as const) : ('site' as const),
    // ホスト許可リスト外の avatarUrl が万一送られても黙って落とす（表示時の二重チェックはしない）
    avatarUrl: v.avatarUrl && isAllowedAvatarUrl(v.avatarUrl) ? v.avatarUrl : null,
  }))
export type SourceInput = z.input<typeof sourceInput>

export const resolveSourceInput = z.object({ url: sourceUrl })
export type ResolveSourceInput = z.input<typeof resolveSourceInput>
