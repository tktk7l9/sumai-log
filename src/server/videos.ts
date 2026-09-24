import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { currentActorEmail } from './members'
import { listLinkTargets } from './places'
import {
  deleteVideoCascade,
  ensureTags,
  getVideoDetail,
  listVideosWithLinks,
  upsertVideo,
  saveOrConflict,
} from './repository'
import { listTagNames } from './tags'
import { videoInput } from './videos.schema'
import { idInput } from './zod'

// videoInput は videos.schema.ts から（テストの都合で分離した理由はそちら参照）。
// 公開する import パス（'./videos' から videoInput/VideoInput を取れる）は変えない。
export { videoInput }
export type { VideoInput } from './videos.schema'

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
    return saveOrConflict(async () => upsertVideo(db, data, await currentActorEmail()))
  })

export const deleteVideo = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    await deleteVideoCascade(getDb(), data.id)
    return { ok: true as const }
  })

/** 動画フォームの選択肢: タグ候補（無ければ既定タグを仕込む）と業者一覧 */
export const videoFormOptions = createServerFn().handler(async () => {
  // 業者一覧は候補フォームと同じ listLinkTargets（src/server/places.ts）を使う
  // （properties も一緒に返るが videoFormOptions では使わない）
  const [tags, targets] = await Promise.all([listTagNames(), listLinkTargets()])
  return { tags, vendors: targets.vendors }
})
