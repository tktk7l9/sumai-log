import { Stack, Title, UnstyledButton } from '@mantine/core'
import { AgendaView } from '@mantine/schedule'
import type { AgendaViewProps, ScheduleEventData } from '@mantine/schedule'
import { useNavigate } from '@tanstack/react-router'

import { dateKey, formatDateWithWeekday } from '../../lib/calendar'
import { toScheduleEvents, type OwnEventPayload } from '../../lib/scheduleEvents'
import { SCHEDULE_LABELS_JA } from '../../lib/scheduleLabels'
import type { EventWithLinks } from '../../server/repository'

/**
 * ホームの「これからの予定」。today 以降の予定を**全部**アジェンダ表示する
 * （所有者の要望、2026-09-21。それまでは 4 週間ぶんだけだった）。
 * 範囲（rangeStart/rangeEnd）は listHomeEvents が返す agendaFrom/agendaTo をそのまま渡す
 * （ここでは再計算しない）。
 *
 * 今日の予定のうち、もう終わった時間のものは色を落とす（`toScheduleEvents` が色を
 * グレーにし、payload.past が立つ。行の文字色は styles.css の
 * `.mantine-AgendaView-agendaViewEvent[data-past]` が落とす）。
 */
export function HomeAgenda({
  events,
  rangeStart,
  rangeEnd,
  nowIso,
}: {
  events: EventWithLinks[]
  rangeStart: string
  rangeEnd: string
  /** 「今」（JST）。終わった予定の色を落とすための基準 */
  nowIso: string
}) {
  const navigate = useNavigate()
  const scheduleEvents = toScheduleEvents(events, nowIso)

  function handleEventClick(event: ScheduleEventData) {
    const payload = event.payload as OwnEventPayload | undefined
    const found = payload ? events.find((e) => e.id === payload.eventId) : undefined
    const key = found ? dateKey(found.startsAt) : dateKey(String(event.start))
    navigate({ to: '/calendar', search: { m: key.slice(0, 7), d: key } })
  }

  // 既定の行の中身（rootProps.children）はそのまま使い、終わった予定の行にだけ
  // data-past を付ける（文字色は CSS 側で落とす）
  const renderEvent: AgendaViewProps['renderEvent'] = (event, rootProps) => {
    const payload = event.payload as OwnEventPayload | undefined
    return <UnstyledButton {...rootProps} data-past={payload?.past ? true : undefined} />
  }

  return (
    <Stack gap="sm">
      <Title order={2}>これからの予定</Title>
      <AgendaView
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        events={scheduleEvents}
        locale="ja"
        labels={SCHEDULE_LABELS_JA}
        // AgendaView が渡す date は 'YYYY-MM-DD HH:mm:ss'（実質 'YYYY-MM-DD'）。
        // dateKey で日付部分に切り出し、次の予定と同じ書式（formatDateWithWeekday）に揃える
        dateHeaderFormat={(date) => formatDateWithWeekday(dateKey(date))}
        // 「9/19 – 10/16」のようなレンジ見出しは不要（所有者の要望、2026-09-19）。
        // headerFormat では消せない（常に `${開始} – ${終了}` で結合される）ので Styles API で隠す
        styles={{ agendaViewHeader: { display: 'none' } }}
        renderEvent={renderEvent}
        onEventClick={handleEventClick}
      />
    </Stack>
  )
}
