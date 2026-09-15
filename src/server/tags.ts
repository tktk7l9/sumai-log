import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDb } from '../db/client'
import { listTags, replaceTags, seedDefaultTags } from './repository'

/** 設定タブのタグ編集・動画フォームの候補で使う。初回アクセスで既定タグを仕込む */
export const listTagNames = createServerFn().handler(async () => {
  const db = getDb()
  await seedDefaultTags(db)
  const rows = await listTags(db)
  return rows.map((r) => r.name)
})

export const tagsInput = z.object({
  names: z.array(z.string().trim().min(1).max(30)).max(100),
})

export const saveTags = createServerFn({ method: 'POST' })
  .validator(tagsInput)
  .handler(async ({ data }) => {
    await replaceTags(getDb(), data.names)
    return { ok: true as const }
  })
