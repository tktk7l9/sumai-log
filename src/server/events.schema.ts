import { z } from 'zod'

import { EVENT_KINDS } from '../db/schema'
import { composeStartsAt } from '../lib/calendar'
import { dateField, idField, optionalText, timeField } from './zod'

/**
 * events.ts から分離した理由: events.ts は（saveEvent の中で使う）currentActorEmail
 * 経由で `./members` → `@tanstack/react-start/server` の `getRequest` を静的 import
 * している。`getRequest` は `@tanstack/start-server-core` を `export *` で丸ごと
 * 引き込み、その中の createStartHandler.js が `import("#tanstack-router-entry")`
 * という TanStack Start の Vite プラグインが実行時に用意する virtual specifier を
 * 静的解析時に踏む。素の vitest workers テスト（vitest.workers.config.ts、
 * TanStack の Vite プラグイン無し）から events.ts を import 経由で読み込むと、
 * eventInput しか使わなくてもこの解決に失敗して落ちる。eventInput 自体は
 * D1 も members も要らない純粋な zod スキーマなので、ここへ切り出して
 * events.worker-test.ts はこちらから import する（events.ts は再エクスポートする
 * だけで、公開している import パス・挙動は変えない）。
 */
export const eventInput = z
  .object({
    id: idField.optional(),
    // 開いた時点の更新日時。相手が先に保存していたら上書きせず競合を返す（repository/stale.ts）
    expectedUpdatedAt: z.string().max(40).nullish(),
    title: z.string().trim().min(1, 'タイトルは必須です').max(200),
    kind: z.enum(EVENT_KINDS),
    date: dateField,
    allDay: z.boolean(),
    startTime: timeField.nullable(),
    endTime: timeField.nullable(),
    placeId: idField.nullable(),
    vendorId: idField.nullable(),
    propertyId: idField.nullable(),
    note: optionalText,
  })
  .refine((v) => v.allDay || v.startTime !== null, {
    message: '開始時刻を入れてください',
    path: ['startTime'],
  })
  .refine((v) => v.allDay || !v.startTime || !v.endTime || v.endTime > v.startTime, {
    message: '終了時刻は開始より後にしてください',
    path: ['endTime'],
  })
  .transform(({ date, startTime, endTime, ...rest }) => ({
    ...rest,
    startsAt: composeStartsAt(date, rest.allDay ? null : startTime),
    endsAt: rest.allDay || !endTime ? null : composeStartsAt(date, endTime),
  }))
export type EventInput = z.input<typeof eventInput>
