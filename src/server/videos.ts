import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDb } from '../db/client'
import { ATTENDEES, vendors } from '../db/schema'
import { canonicalYouTubeUrl, parseYouTubeId } from '../lib/youtube'
import { currentActorEmail } from './members'
import {
  deleteVideoCascade,
  ensureTags,
  getVideoDetail,
  listVideosWithLinks,
  upsertVideo,
} from './repository'
import { listTagNames } from './tags'
import { dateField, idField, idInput, optionalUrl } from './zod'

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

export const listVideos = createServerFn().handler(async () => listVideosWithLinks(getDb()))

export const getVideo = createServerFn()
  .validator(idInput)
  .handler(async ({ data }) => {
    const detail = await getVideoDetail(getDb(), data.id)
    if (!detail) throw new Response('Not Found', { status: 404 })
    return detail
  })

export const saveVideo = createServerFn({ method: 'POST' })
  .validator(videoInput)
  .handler(async ({ data }) => {
    const db = getDb()
    await ensureTags(db, data.tags)
    return { id: await upsertVideo(db, data, await currentActorEmail()) }
  })

export const deleteVideo = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    await deleteVideoCascade(getDb(), data.id)
    return { ok: true as const }
  })

/** 動画フォームの選択肢: タグ候補（無ければ既定タグを仕込む）と業者一覧 */
export const videoFormOptions = createServerFn().handler(async () => {
  const [tags, vendorRows] = await Promise.all([
    listTagNames(),
    getDb().select({ id: vendors.id, name: vendors.name }).from(vendors).orderBy(vendors.name),
  ])
  return { tags, vendors: vendorRows }
})
