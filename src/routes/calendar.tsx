import { Badge, Group, Indicator, Stack, Text } from '@mantine/core'
import { Calendar } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { z } from 'zod'

import { EventForm } from '../components/calendar/EventForm'
import { EventList } from '../components/calendar/EventList'
import { EmptyState } from '../components/EmptyState'
import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { groupByDay } from '../lib/calendar'
import { holidayName } from '../lib/holidays'
import { pendingVisitEvents } from '../lib/pending'
import { deleteEvent, listMonthEvents } from '../server/events'
import { listLinkTargets, listPlaces } from '../server/places'
import type { EventWithLinks } from '../server/repository'

const search = z.object({
  // 表示中の月 'YYYY-MM'。無ければ今月
  m: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  // 選択日 'YYYY-MM-DD'
  d: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

export const Route = createFileRoute('/calendar')({
  component: Page,
  validateSearch: (s) => search.parse(s),
  loaderDeps: ({ search }) => ({ m: search.m }),
  loader: async ({ deps }) => {
    // サーバー側で「今月」を決める（クライアントの時計に依らない）
    const base = deps.m
      ? { year: Number(deps.m.slice(0, 4)), month: Number(deps.m.slice(5, 7)) }
      : null
    const [month, targets, places] = await Promise.all([
      listMonthEvents({ data: base ?? currentYearMonth() }),
      listLinkTargets(),
      listPlaces(),
    ])
    return { ...month, targets, places, ym: base ?? currentYearMonth() }
  },
})

function currentYearMonth() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

function Page() {
  const { events, recordedEventIds, todayKey, nowIso, targets, places, ym } = Route.useLoaderData()
  const { d } = Route.useSearch()
  const navigate = useNavigate({ from: '/calendar' })
  const router = useRouter()
  const remove = useServerFn(deleteEvent)
  const [editing, setEditing] = useState<EventWithLinks | null>(null)
  const [creating, setCreating] = useState(false)

  const byDay = useMemo(() => groupByDay(events), [events])
  const recorded = useMemo(() => new Set(recordedEventIds), [recordedEventIds])
  const recordable = useMemo(
    () => new Set(pendingVisitEvents(events, recorded, nowIso).map((e) => e.id)),
    [events, recorded, nowIso],
  )
  const ymKey = `${ym.year}-${String(ym.month).padStart(2, '0')}`
  const selected = d?.startsWith(ymKey) ? d : todayKey.startsWith(ymKey) ? todayKey : `${ymKey}-01`
  const dayEvents = byDay.get(selected) ?? []
  const monthDate = new Date(Date.UTC(ym.year, ym.month - 1, 1))

  async function handleDelete(e: EventWithLinks) {
    if (!window.confirm(`「${e.title}」を削除します。見学記録は残ります。`)) return
    try {
      await remove({ data: { id: e.id } })
      await router.invalidate()
      notifications.show({ message: '予定を削除しました' })
    } catch {
      notifications.show({ message: '削除できませんでした', color: 'red' })
    }
  }

  return (
    <PageShell title="予定" fab>
      <Stack gap="md" align="center">
        <Calendar
          date={monthDate}
          onDateChange={(next) =>
            navigate({ search: (s) => ({ ...s, m: dayjs(next).format('YYYY-MM') }) })
          }
          size="md"
          getDayProps={(key) => ({
            selected: key === selected,
            onClick: () => navigate({ search: (s) => ({ ...s, d: key }) }),
          })}
          renderDay={(key) => {
            const n = byDay.get(key)?.length ?? 0
            const holiday = holidayName(key)
            return (
              <Indicator size={6} color="clay" offset={-2} disabled={n === 0}>
                <Text
                  size="sm"
                  c={holiday ? 'red' : undefined}
                  fw={key === todayKey ? 700 : undefined}
                >
                  {dayjs(key).date()}
                </Text>
              </Indicator>
            )
          }}
        />
        <Group justify="space-between" w="100%">
          <Text fw={700}>
            {selected}
            {holidayName(selected) ? (
              <Badge ml="xs" color="red" variant="light">
                {holidayName(selected)}
              </Badge>
            ) : null}
          </Text>
        </Group>
        {dayEvents.length === 0 ? (
          <EmptyState title="この日の予定はありません" description="右下の追加から登録できます。" />
        ) : (
          <EventList
            events={dayEvents}
            recordedEventIds={recorded}
            recordable={recordable}
            onEdit={setEditing}
            onDelete={handleDelete}
            onRecord={(e) =>
              navigate({ to: '/records', search: { tab: 'visits', fromEvent: e.id } })
            }
          />
        )}
      </Stack>

      <Fab label="予定を追加" onClick={() => setCreating(true)} />
      <FormDrawer opened={creating} onClose={() => setCreating(false)} title="予定を追加">
        <EventForm
          event={null}
          defaults={{ date: selected }}
          targets={targets}
          places={places}
          onSaved={() => setCreating(false)}
        />
      </FormDrawer>
      <FormDrawer opened={editing !== null} onClose={() => setEditing(null)} title="予定を編集">
        {editing ? (
          <EventForm
            event={editing}
            targets={targets}
            places={places}
            onSaved={() => setEditing(null)}
          />
        ) : null}
      </FormDrawer>
    </PageShell>
  )
}
