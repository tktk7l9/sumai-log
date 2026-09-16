import type { ScheduleEventData } from '@mantine/schedule'

import type { EventWithLinks, NewsEventRow } from '../server/repository'
import { dateKey, splitStartsAt } from './calendar'

/** カレンダーの予定は「自分たちの予定」だけ。外部由来のイベントは無いので kind は固定。 */
export type OwnEventPayload = { kind: 'own'; eventId: string }
/** 業者のお知らせ（情報レイヤー）。「行く」で自分の予定に変換するまでは own にならない。 */
export type NewsEventPayload = { kind: 'news'; newsId: string }
/** Schedule に渡すイベントの payload は、自分の予定・業者のお知らせのどちらか */
export type CalendarPayload = OwnEventPayload | NewsEventPayload

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

/**
 * 業者のお知らせ（イベント判定済みのもの）を @mantine/schedule の情報レイヤー用
 * ScheduleEventData に変換する（純粋関数）。design.md §4「カレンダー」のとおり、
 * 自分の予定とは別に常にグレーで描く（「行く」で自分の予定になっても、この情報
 * レイヤーからは消さない＝両方表示され続ける）。event_start/event_end が無い行
 * （イベント未判定）は呼び出し側で既に除かれている前提だが、念のためここでも
 * eventStart が無い行は捨てる。
 *
 * 終日イベントとして扱う（`toScheduleEvents` の終日ケースと同じ 00:00:00〜翌日
 * 00:00:00）。event_end が無ければ単日（event_start と同じ日）とみなす。
 * id は自分の予定の id と衝突しないよう `news-` を前置する（同じ Schedule に
 * 両方の配列を混ぜて渡すため）。
 */
export function newsToScheduleEvents(
  items: readonly NewsEventRow[],
): ScheduleEventData<NewsEventPayload>[] {
  return items
    .filter((n): n is NewsEventRow & { eventStart: string } => n.eventStart !== null)
    .map((n) => {
      const start = n.eventStart
      const end = n.eventEnd ?? start
      const payload: NewsEventPayload = { kind: 'news', newsId: n.id }
      return {
        id: `news-${n.id}`,
        title: `${n.vendorName} ${n.title}`,
        start: `${start} 00:00:00`,
        end: `${nextDay(end)} 00:00:00`,
        color: 'gray',
        payload,
      }
    })
}
