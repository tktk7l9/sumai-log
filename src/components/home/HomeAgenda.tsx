import { Stack, Title } from '@mantine/core'
import { AgendaView } from '@mantine/schedule'
import type { ScheduleEventData } from '@mantine/schedule'
import { useNavigate } from '@tanstack/react-router'

import { dateKey, formatDateWithWeekday } from '../../lib/calendar'
import { toScheduleEvents, type OwnEventPayload } from '../../lib/scheduleEvents'
import { SCHEDULE_LABELS_JA } from '../../lib/scheduleLabels'
import type { EventWithLinks } from '../../server/repository'

/**
 * ホームの「これからの予定」。today 〜 today+27日（4 週間）をアジェンダ表示する。
 * 範囲（rangeStart/rangeEnd）は listHomeEvents が返す agendaFrom/agendaTo をそのまま渡す
 * （ここでは再計算しない）。
 */
export function HomeAgenda({
  events,
  rangeStart,
  rangeEnd,
}: {
  events: EventWithLinks[]
  rangeStart: string
  rangeEnd: string
}) {
  const navigate = useNavigate()
  const scheduleEvents = toScheduleEvents(events)

  function handleEventClick(event: ScheduleEventData) {
    const payload = event.payload as OwnEventPayload | undefined
    const found = payload ? events.find((e) => e.id === payload.eventId) : undefined
    const key = found ? dateKey(found.startsAt) : dateKey(String(event.start))
    navigate({ to: '/calendar', search: { m: key.slice(0, 7), d: key } })
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
        onEventClick={handleEventClick}
      />
    </Stack>
  )
}
