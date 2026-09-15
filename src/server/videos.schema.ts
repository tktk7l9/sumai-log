import { z } from 'zod'

import { ATTENDEES } from '../db/schema'
import { canonicalYouTubeUrl, parseYouTubeId } from '../lib/youtube'
import { dateField, idField, optionalUrl } from './zod'

/**
 * videos.ts から分離した理由: events.schema.ts と同じ（詳細はそちらのコメント参照）。
 * videos.ts は saveVideo の中で currentActorEmail（`@tanstack/react-start/server` の
 * getRequest を静的 import）を使っており、素の vitest workers テストから videos.ts を
 * import 経由で読み込むと TanStack Start の Vite プラグインが用意する virtual specifier
 * の解決に失敗して落ちる。videoInput 自体は D1 も members も要らない純粋な zod スキーマ
 * なので、ここへ切り出して videos.worker-test.ts はこちらから import する（videos.ts は
 * 再エクスポートするだけで、公開している import パス・挙動は変えない）。
 */
export const videoInput = z
  .object({
    id: idField.optional(),
    url: z.string().trim().max(500),
    title: z.string().trim().min(1, '題名は必須です').max(300),
    // optionalText はヘルパの形固定（max 2000）のためここでは使えない（G3-R2）。
    // 同じ null/空文字の意味論を維持したまま上限だけ変える。
    channel: z
      .string()
      .trim()
      .max(200)
      .transform((v) => (v === '' ? null : v))
      .nullable(),
    thumbnailUrl: optionalUrl,
    watchedOn: dateField.nullable(),
    watchedBy: z.enum(ATTENDEES),
    tags: z.array(z.string().trim().min(1).max(30)).max(10),
    takeaways: z
      .string()
      .trim()
      .max(4000)
      .transform((v) => (v === '' ? null : v))
      .nullable(),
    vendorId: idField.nullable(),
  })
  .transform((v, ctx) => {
    const videoId = parseYouTubeId(v.url)
    if (!videoId) {
      ctx.addIssue({ code: 'custom', message: 'YouTube の URL を入れてください', path: ['url'] })
      return z.NEVER
    }
    return { ...v, videoId, url: canonicalYouTubeUrl(videoId) }
  })
export type VideoInput = z.input<typeof videoInput>
