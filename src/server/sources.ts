import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { currentActorEmail } from './members'
import { listLinkTargets } from './places'
import { deleteSourceRow, listSourcesWithLinks, upsertSource } from './repository'
import { resolveSourceCore } from './sourcesFetcher'
import { resolveSourceInput, sourceInput } from './sources.schema'
import { idInput } from './zod'

// sourceInput は sources.schema.ts から（テストの都合で分離した理由はそちら参照）。
// 公開する import パス（'./sources' から sourceInput/SourceInput を取れる）は変えない。
export { sourceInput }
export type { SourceInput } from './sources.schema'

export const listSources = createServerFn().handler(async () => listSourcesWithLinks(getDb()))

export const saveSource = createServerFn({ method: 'POST' })
  .validator(sourceInput)
  .handler(async ({ data }) => ({
    id: await upsertSource(getDb(), data, await currentActorEmail()),
  }))

/** 行が既に無ければ ok: false（deletePhoto と同じパターン。videos.ts の deleteVideo と
 * 違い、こちらは対象の有無を呼び出し元へ返す） */
export const deleteSource = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => ({ ok: (await deleteSourceRow(getDb(), data.id)) !== null }))

/** フォームの「取得」ボタン。YouTube チャンネル URL だけを対象にする
 * （sourcesFetcher.ts 参照）。実処理は createServerFn の外（素の関数）に置いてあり、
 * ここはラップするだけ */
export const resolveSource = createServerFn({ method: 'POST' })
  .validator(resolveSourceInput)
  .handler(async ({ data }) => resolveSourceCore(data.url))

/** フォームの選択肢: 候補の会社（業者）一覧。候補フォームと同じ listLinkTargets を使う
 * （properties も一緒に返るが sourceFormOptions では使わない。videoFormOptions と同じ形） */
export const sourceFormOptions = createServerFn().handler(async () => {
  const targets = await listLinkTargets()
  return { vendors: targets.vendors }
})
