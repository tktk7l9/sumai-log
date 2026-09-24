import type { ScheduleEventData } from '@mantine/schedule'

import type { EventWithLinks, NewsEventRow } from '../server/repository'
import { dateKey, splitStartsAt } from './calendar'

/** カレンダーの予定は「自分たちの予定」だけ。外部由来のイベントは無いので kind は固定。 */
export type OwnEventPayload = { kind: 'own'; eventId: string; past: boolean }
/** 業者のお知らせ（情報レイヤー）。「行く」で自分の予定に変換するまでは own にならない。 */
export type NewsEventPayload = { kind: 'news'; newsId: string; past: boolean }
/** Schedule に渡すイベントの payload は、自分の予定・業者のお知らせのどちらか */
export type CalendarPayload = OwnEventPayload | NewsEventPayload

const KIND_COLOR: Record<EventWithLinks['kind'], string> = {
  visit: 'clay',
  meeting: 'blue',
  viewing: 'teal',
  other: 'gray',
}

/**
 * 終わった予定の色（所有者の要望、2026-09-21）。種別の色（clay/blue/teal）を捨てて
 * グレーに落とし、これからの予定と一目で見分けられるようにする。`gray` は theme の
 * パレットにあるキーなので、Mantine が明暗どちらの配色でも読める前景色を選ぶ
 * （`'gray.4'` のように段を指定すると light variant の背景が生の色になり、ダークで
 * 文字が読めなくなるのでキーのまま渡す）。
 */
export const PAST_EVENT_COLOR = 'gray'

/**
 * 「今」（`nowJstIso()` の 'YYYY-MM-DDTHH:MM:SS+09:00'、または日付だけの
 * 'YYYY-MM-DD'）を Schedule と同じ 'YYYY-MM-DD HH:mm:ss' に揃える。どちらも JST の
 * 壁時計なので、この形なら文字列比較で前後が決まる（Date に変換しない）。
 */
export function toScheduleStamp(nowIso: string): string {
  const date = dateKey(nowIso)
  return `${date} ${nowIso.length > 10 ? nowIso.slice(11, 19) : '00:00:00'}`
}

/**
 * 業者のお知らせが「終わったイベント」か。日程（eventStart/eventEnd）を持つお知らせ
 * だけが対象で、日程の無いお知らせは（公開日は必ず過去なので）過去扱いしない。
 * 終了日の当日いっぱいは終わっていない扱いにする（todayKey より前なら過去）。
 */
export function isPastNews(
  news: { eventStart: string | null; eventEnd: string | null },
  todayKey: string,
): boolean {
  if (!news.eventStart) return false
  return (news.eventEnd ?? news.eventStart) < todayKey
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
 *
 * `nowIso`（`nowJstIso()` の値）を渡すと、終わった予定（終了が「今」より前）の色を
 * `PAST_EVENT_COLOR` に落とし、payload に `past: true` を立てる（所有者の要望、
 * 2026-09-21）。省略したときは全て「これから」の扱い。
 */
export function toScheduleEvents(
  events: readonly EventWithLinks[],
  nowIso?: string,
): ScheduleEventData<OwnEventPayload>[] {
  const nowStamp = nowIso ? toScheduleStamp(nowIso) : null
  return events.map((e) => {
    const date = dateKey(e.startsAt)
    const time = splitStartsAt(e.startsAt).time

    let start: string
    let end: string
    if (e.allDay || time === null) {
      start = `${date} 00:00:00`
      end = `${nextDay(date)} 00:00:00`
    } else {
      start = `${date} ${time}:00`
      if (e.endsAt) {
        const endDate = dateKey(e.endsAt)
        const endTime = splitStartsAt(e.endsAt).time as string
        end = `${endDate} ${endTime}:00`
      } else {
        const rolled = plusOneHour(date, time)
        end = `${rolled.date} ${rolled.time}:00`
      }
    }

    // 終わった＝「今」が終了時刻に達している。終日は翌日 00:00 が終了なので、
    // その日のうちは過去にならない
    const past = nowStamp !== null && end <= nowStamp
    const payload: OwnEventPayload = { kind: 'own', eventId: e.id, past }
    return {
      id: e.id,
      title: e.title,
      start,
      end,
      color: past ? PAST_EVENT_COLOR : KIND_COLOR[e.kind],
      payload,
    }
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
 *
 * `todayKey`（'YYYY-MM-DD'）を渡すと、終わった日程のお知らせに `past: true` を立てる
 * （色は元からグレーなので変えない。描画側が文字色を落とす）。
 */
export function newsToScheduleEvents(
  items: readonly NewsEventRow[],
  todayKey?: string,
): ScheduleEventData<NewsEventPayload>[] {
  return items
    .filter((n): n is NewsEventRow & { eventStart: string } => n.eventStart !== null)
    .map((n) => {
      const start = n.eventStart
      const end = n.eventEnd ?? start
      const payload: NewsEventPayload = {
        kind: 'news',
        newsId: n.id,
        past: todayKey !== undefined && isPastNews(n, todayKey),
      }
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

/**
 * お知らせを公開日（publishedOn）ごとにまとめ、**新しい日を上**にして返す（純粋関数。
 * `NewsAgenda` の一覧用。所有者の要望、2026-09-24）。日付はイベント日（eventStart）ではなく
 * 公開日（「お知らせ」はまず公開されたことを見せる一覧で、イベント判定はバッジで添えるだけ）。
 * 同じ日の中は渡した順のまま。
 *
 * `todayKey`（'YYYY-MM-DD'）を渡すと、終わった日程のお知らせに `past: true` を立てる
 * （NewsAgenda が文字色を落とす。公開日そのものは常に過去なので基準にしない）。
 */
export function groupNewsByDate<T extends NewsEventRow>(
  items: readonly T[],
  todayKey?: string,
): { date: string; items: { news: T; past: boolean }[] }[] {
  const groups = new Map<string, { news: T; past: boolean }[]>()
  for (const news of items) {
    const past = todayKey !== undefined && isPastNews(news, todayKey)
    const list = groups.get(news.publishedOn)
    if (list) list.push({ news, past })
    else groups.set(news.publishedOn, [{ news, past }])
  }
  return [...groups]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => ({ date, items: list }))
}
