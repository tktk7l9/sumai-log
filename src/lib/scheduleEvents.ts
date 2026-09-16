import type { ScheduleEventData } from '@mantine/schedule'

import type { EventWithLinks } from '../server/repository'
import { dateKey, splitStartsAt } from './calendar'

/** カレンダーの予定は「自分たちの予定」だけ。外部由来のイベントは無いので kind は固定。 */
export type OwnEventPayload = { kind: 'own'; eventId: string }

const KIND_COLOR: Record<EventWithLinks['kind'], string> = {
  visit: 'clay',
  meeting: 'blue',
  viewing: 'teal',
  other: 'gray',
}

/** 'YYYY-MM-DD' の翌日を 'YYYY-MM-DD' で返す。終日イベントの end や日またぎの計算に使う */
export function nextDay(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day + 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`
}

/** 'HH:MM' に 60 分足す。日をまたいだら date も翌日にする */
function plusOneHour(date: string, time: string): { date: string; time: string } {
  const [hour, minute] = time.split(':').map(Number)
  const total = hour * 60 + minute + 60
  const overflowsDay = total >= 24 * 60
  const rem = total % (24 * 60)
  const hh = String(Math.floor(rem / 60)).padStart(2, '0')
  const mm = String(rem % 60).padStart(2, '0')
  return { date: overflowsDay ? nextDay(date) : date, time: `${hh}:${mm}` }
}

/**
 * 予定を @mantine/schedule の ScheduleEventData に変換する（純粋関数）。
 *
 * 終日（allDay、または startsAt が日付のみで時刻を持たない）は
 * 'YYYY-MM-DD 00:00:00' 〜 翌日 'YYYY-MM-DD 00:00:00'。
 * 時刻ありは startsAt/endsAt をそのまま使い、endsAt が無ければ開始の 60 分後にする。
 * endsAt が入っている場合は eventInput（composeStartsAt 経由）により必ず時刻付きなので、
 * ここでは時刻の有無を再チェックしない。
 */
export function toScheduleEvents(
  events: readonly EventWithLinks[],
): ScheduleEventData<OwnEventPayload>[] {
  return events.map((e) => {
    const color = KIND_COLOR[e.kind]
    const payload: OwnEventPayload = { kind: 'own', eventId: e.id }
    const date = dateKey(e.startsAt)
    const time = splitStartsAt(e.startsAt).time

    if (e.allDay || time === null) {
      return {
        id: e.id,
        title: e.title,
        start: `${date} 00:00:00`,
        end: `${nextDay(date)} 00:00:00`,
        color,
        payload,
      }
    }

    const start = `${date} ${time}:00`
    let end: string
    if (e.endsAt) {
      const endDate = dateKey(e.endsAt)
      const endTime = splitStartsAt(e.endsAt).time as string
      end = `${endDate} ${endTime}:00`
    } else {
      const rolled = plusOneHour(date, time)
      end = `${rolled.date} ${rolled.time}:00`
    }

    return { id: e.id, title: e.title, start, end, color, payload }
  })
}
