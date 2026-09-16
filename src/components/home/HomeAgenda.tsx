import { Stack, Title } from '@mantine/core'
import { AgendaView } from '@mantine/schedule'
import type { ScheduleEventData } from '@mantine/schedule'
import { useNavigate } from '@tanstack/react-router'

import { addDays, dateKey } from '../../lib/calendar'
import { toScheduleEvents, type OwnEventPayload } from '../../lib/scheduleEvents'
import { SCHEDULE_LABELS_JA } from '../../lib/scheduleLabels'
import type { EventWithLinks } from '../../server/repository'

/** ホームの「これからの予定」。今日から 4 週間（28 日）ぶんをアジェンダ表示する */
export function HomeAgenda({ events, todayKey }: { events: EventWithLinks[]; todayKey: string }) {
  const navigate = useNavigate()
  const rangeEndKey = addDays(todayKey, 27)
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
        rangeStart={todayKey}
        rangeEnd={rangeEndKey}
        events={scheduleEvents}
        locale="ja"
        labels={SCHEDULE_LABELS_JA}
        dateHeaderFormat="M月D日（ddd）"
        // headerFormat は常に `${開始} – ${終了}` というテンプレートで結合されるため
        // 空文字を返しても「 – 」だけが残ってしまう（ライブラリの仕様）。
        // 非表示にはできないので、コンパクトな 'M/D' 表記にする
        headerFormat="M/D"
        onEventClick={handleEventClick}
      />
    </Stack>
  )
}
