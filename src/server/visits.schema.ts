import { z } from 'zod'

import { idField } from './zod'

/**
 * visits.ts から分離した理由: events.schema.ts と同じ（詳細はそちらのコメント参照）。
 * visits.ts は saveVisit の中で currentActorEmail（`@tanstack/react-start/server` の
 * getRequest を静的 import）を使っており、素の vitest workers テストから visits.ts を
 * import 経由で読み込むと TanStack Start の Vite プラグインが用意する virtual specifier
 * の解決に失敗して落ちる。reorderPhotosInput 自体は D1 も members も要らない純粋な
 * zod スキーマなので、ここへ切り出して visits.worker-test.ts はこちらから import する
 * （visits.ts は再エクスポートするだけで、公開している import パス・挙動は変えない）。
 *
 * 「その見学記録に属する写真か」までは zod では確かめない（D1 が要るため）。
 * ここでは形だけ（空でない・id の形・重複なし）を見て、所有チェックは
 * repository の reorderPhotoRows に任せる。
 */
export const reorderPhotosInput = z.object({
  visitId: idField,
  photoIds: z
    .array(idField)
    .min(1, '写真が指定されていません')
    .refine((arr) => new Set(arr).size === arr.length, '同じ写真が重複して指定されています'),
})
export type ReorderPhotosInput = z.infer<typeof reorderPhotosInput>
