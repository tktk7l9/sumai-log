import { compareStartsAt, dateKey } from './calendar'

export type PendingEvent = {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
  allDay: boolean
  kind: string
}

const RECORDABLE = new Set(['visit', 'viewing'])

/** 終わった見学/内覧で、まだ見学記録が無いもの。新しい順 */
export function pendingVisitEvents<T extends PendingEvent>(
  events: readonly T[],
  recordedEventIds: ReadonlySet<string>,
  nowIso: string,
): T[] {
  const today = dateKey(nowIso)
  return events
    .filter((e) => RECORDABLE.has(e.kind) && !recordedEventIds.has(e.id))
    .filter((e) => (e.allDay ? dateKey(e.startsAt) < today : (e.endsAt ?? e.startsAt) < nowIso))
    .sort((a, b) => compareStartsAt(b.startsAt, a.startsAt))
}
