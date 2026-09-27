import { z } from 'zod'

import { EVENT_KINDS } from '../db/schema'
import { composeStartsAt } from '../lib/calendar'
import { dateField, idField, optionalText, timeField } from './zod'

/**
 * Why this is split from events.ts: through currentActorEmail (used inside saveEvent),
 * events.ts statically imports `./members` -> `getRequest` of `@tanstack/react-start/server`.
 * `getRequest` pulls in all of `@tanstack/start-server-core` through `export *`, and
 * createStartHandler.js inside it hits, at static analysis time,
 * `import("#tanstack-router-entry")`, a virtual specifier that the TanStack Start Vite plugin
 * provides at runtime. Loading events.ts through import from a plain vitest workers test
 * (vitest.workers.config.ts, without the TanStack Vite plugin) fails this resolution and
 * crashes even when only eventInput is used. eventInput itself is a pure zod schema that
 * needs neither D1 nor members, so it is extracted here and events.worker-test.ts imports
 * from this file (events.ts only re-exports, and the public import path and behaviour do
 * not change).
 */
export const eventInput = z
  .object({
    id: idField.optional(),
    // The updated-at at the time of opening. If the other person saved first, return a conflict
    // instead of overwriting (repository/stale.ts)
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
