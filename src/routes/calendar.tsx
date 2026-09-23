import { Button, Group, Stack, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { Schedule } from '@mantine/schedule'
import type { ScheduleEventData, ScheduleViewLevel } from '@mantine/schedule'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'

import { EventForm } from '../components/calendar/EventForm'
import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { NewsEventDrawer } from '../components/news/NewsEventDrawer'
import { PageShell } from '../components/PageShell'
import { extractErrorMessage } from '../lib/formError'
import { dateKey, formatDateSlash, formatDateWithWeekday } from '../lib/calendar'
import { holidayName } from '../lib/holidays'
import { planEventDefaults } from '../lib/news/planDefaults'
import { newsToScheduleEvents, toScheduleEvents, type CalendarPayload } from '../lib/scheduleEvents'
import { SCHEDULE_LABELS_JA } from '../lib/scheduleLabels'
import { deleteEvent, listEventsBetween } from '../server/events'
import { getVendorNews, linkNewsToEvent, newsEventsBetween } from '../server/news'
import { listLinkTargets, listPlaces } from '../server/places'
import type { EventWithLinks, NewsEventRow } from '../server/repository'

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
  // 表示ビュー。年表示はヘッダーから選べても URL には持たせない
  v: z.enum(['day', 'week', 'month']).optional(),
  // お知らせの「行く」から来たとき: そのお知らせを初期値にした予定フォームを開く
  plan: z.string().uuid().optional(),
})

export const Route = createFileRoute('/calendar')({
  component: Page,
  validateSearch: (s) => search.parse(s),
  loaderDeps: ({ search }) => ({ m: search.m, d: search.d, v: search.v, plan: search.plan }),
  loader: async ({ deps }) => {
    // サーバー側で「今日」を決める（クライアントの時計に依らない）
    const date = deps.d ?? (deps.m ? `${deps.m}-01` : todayKeyJst())
    const view = deps.v ?? 'month'
    const { from, to } = visibleRange(date, view)
    const [range, targets, places, news, planNews] = await Promise.all([
      listEventsBetween({ data: { from, to } }),
      listLinkTargets(),
      listPlaces(),
      // 情報レイヤー用。月をまたいではみ出す表示範囲（visibleRange）と同じ from/to で取る
      // （月単位で区切ると、月表示が前後にはみ出す週ぶんの情報が漏れる）
      newsEventsBetween({ data: { from, to } }),
      deps.plan ? getVendorNews({ data: { id: deps.plan } }).then((r) => r.news) : null,
    ])
    // range には listEventsBetween が返す nowIso / todayKey（サーバーが決めた「今」）も
    // 入っている。終わった予定・終わった日程のお知らせの色を落とす基準に使う
    return { ...range, targets, places, date, newsEvents: news.news, planNews }
  },
})

function todayKeyJst(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`
}

/**
 * ビューが実際に描画しうる範囲を取る。週表示は月をまたぐことがあるので、
 * 「表示月だけ」ではなく実際の日付範囲を直接計算する。
 */
function visibleRange(date: string, view: 'day' | 'week' | 'month'): { from: string; to: string } {
  const base = dayjs(`${date}T00:00:00`)
  if (view === 'day') return { from: date, to: date }
  if (view === 'week') {
    // 月曜始まり
    const mondayOffset = (base.day() + 6) % 7
    const start = base.subtract(mondayOffset, 'day')
    return { from: start.format('YYYY-MM-DD'), to: start.add(6, 'day').format('YYYY-MM-DD') }
  }
  // 月表示は前後の週がはみ出すぶんも少し広めに取る
  const start = base.startOf('month').subtract(7, 'day')
  const end = base.endOf('month').add(7, 'day')
  return { from: start.format('YYYY-MM-DD'), to: end.format('YYYY-MM-DD') }
}

function Page() {
  const { events, targets, places, date, newsEvents, planNews, nowIso, todayKey } =
    Route.useLoaderData()
  const { d, v } = Route.useSearch()
  const navigate = useNavigate({ from: '/calendar' })
  const router = useRouter()
  const remove = useServerFn(deleteEvent)
  const linkNews = useServerFn(linkNewsToEvent)
  const [editing, setEditing] = useState<EventWithLinks | null>(null)
  const [creating, setCreating] = useState(false)
  // 情報レイヤーのドロワーは id だけ持つ（news 自体は loader データから毎回引き直す）。
  // こうしておくと「行く」後の router.invalidate() で newsEvents が更新されたとき、
  // 同じドロワーを開いたまま plannedEventId 付きの最新の news に自然と切り替わり、
  // ボタンが「行く」→「予定を見る」に変わる。
  const [newsDrawerNewsId, setNewsDrawerNewsId] = useState<string | null>(null)
  // 'year' は URL に持たせない（v の search スキーマに無い）ので、ヘッダーから
  // 選ばれても表示だけローカル state で切り替える
  const [view, setView] = useState<ScheduleViewLevel>(v ?? 'month')
  // モバイルは月表示の1セルの高さを詰める必要がある（所有者の報告、2026-09-16。
  // styles.css の該当コメント参照）。1日あたりの表示イベント数を 2→1 に減らすと
  // Mantine 自身が `--month-view-max-events` を連動して下げ、高さも詰まる
  // （CSS 側でこの変数を直接上書きしないのは、実際に描画するイベント数と
  // ズレるため）。デスクトップ（sm 以上）は既定の 2 のまま
  const isMobile = useMediaQuery('(max-width: 47.99em)', true)

  useEffect(() => {
    setView(v ?? 'month')
  }, [v])

  // 終わった予定は種別の色を捨ててグレーにし（toScheduleEvents）、終わった日程の
  // お知らせは payload.past を立てて文字色を落とす（下の renderEventBody）。
  // 所有者の要望（2026-09-21）
  const scheduleEvents = useMemo<ScheduleEventData<CalendarPayload>[]>(
    () => [...toScheduleEvents(events, nowIso), ...newsToScheduleEvents(newsEvents, todayKey)],
    [events, newsEvents, nowIso, todayKey],
  )
  const selected = d ?? date
  const newsDrawerNews = newsDrawerNewsId
    ? (newsEvents.find((n) => n.id === newsDrawerNewsId) ?? null)
    : null

  function navigateToDay(next: string) {
    // Schedule のコールバックは型上 'YYYY-MM-DD' だが実際は 'YYYY-MM-DD HH:mm:ss' で来るため、
    // 日付部分だけ取り出してから search に入れる（そのまま入れると validateSearch で落ちる）
    navigate({ search: (s) => ({ ...s, d: dateKey(next) }), replace: true })
  }

  function handleViewChange(next: ScheduleViewLevel) {
    setView(next)
    if (next === 'day' || next === 'week' || next === 'month') {
      navigate({ search: (s) => ({ ...s, v: next }), replace: true })
    }
  }

  function handleEventClick(ev: ScheduleEventData) {
    const payload = ev.payload as CalendarPayload | undefined
    if (!payload) return
    if (payload.kind === 'own') {
      const found = events.find((e) => e.id === payload.eventId)
      if (found) setEditing(found)
      return
    }
    setNewsDrawerNewsId(payload.newsId)
  }

  async function handleDelete(e: EventWithLinks) {
    if (!window.confirm(`「${e.title}」を削除します。見学記録は残ります。`)) return
    try {
      await remove({ data: { id: e.id } })
      await router.invalidate()
      setEditing(null)
      notifications.show({ message: '予定を削除しました' })
    } catch {
      notifications.show({ message: '削除できませんでした', color: 'red' })
    }
  }

  /** お知らせドロワーの「行く」。即作成せず ?plan= を付けて初期値入りの予定フォームを開く */
  function handlePlanVisit(news: NewsEventRow) {
    setNewsDrawerNewsId(null)
    navigate({ search: (s) => ({ ...s, plan: news.id }), replace: true })
  }

  // 「行く」から来た予定フォーム（?plan=）。初期値は planEventDefaults。閉じたら plan を外す
  const planDefaults = planNews ? planEventDefaults(planNews) : null
  function closePlan() {
    navigate({ search: (s) => ({ ...s, plan: undefined }), replace: true })
  }
  async function handlePlanSaved(eventId: string) {
    if (!planNews) return
    try {
      await linkNews({ data: { newsId: planNews.id, eventId } })
      await router.invalidate()
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
    }
    closePlan()
  }

  /** お知らせドロワーの「予定を見る」（既に「行く」済み）。自分の予定の編集ドロワーへ */
  function handleViewPlannedEvent(news: NewsEventRow) {
    setNewsDrawerNewsId(null)
    const found = news.plannedEventId ? events.find((e) => e.id === news.plannedEventId) : undefined
    if (found) setEditing(found)
    else if (news.eventStart) navigateToDay(news.eventStart)
  }

  /** 予定の中身。終わったものは文字色を落とす（背景の色は color が決める） */
  function renderEventBody(event: ScheduleEventData) {
    const payload = event.payload as CalendarPayload | undefined
    return (
      <Text span inherit c={payload?.past ? 'dimmed' : undefined}>
        {event.title}
      </Text>
    )
  }

  function dayProps(key: string) {
    const name = holidayName(key)
    return name ? { style: { color: 'var(--mantine-color-red-6)' }, title: name } : {}
  }

  return (
    <PageShell title="予定" titleHidden fab>
      <Stack gap="md">
        <Schedule
          date={date}
          onDateChange={(next) => {
            const key = dateKey(next)
            navigate({ search: (s) => ({ ...s, m: key.slice(0, 7), d: key }), replace: true })
          }}
          view={view}
          onViewChange={handleViewChange}
          events={scheduleEvents}
          labels={SCHEDULE_LABELS_JA}
          // モバイルも PC と同じビュー（月/週/日）にする（所有者の要望、2026-09-16）。
          // 'responsive' だとスマホ幅で MobileMonthView に切り替わり PC と見た目が変わって
          // いた。layout="default" なら常に monthViewProps 等の通常ビューを使うので、
          // 'responsive' 専用の mobileMonthViewProps は不要（渡しても使われない）
          layout="default"
          mode="default"
          onDayClick={(next) => navigateToDay(next)}
          onEventClick={handleEventClick}
          renderEventBody={renderEventBody}
          monthViewProps={{
            firstDayOfWeek: 1,
            weekendDays: [0, 6],
            highlightToday: true,
            getDayProps: dayProps,
            maxEventsPerDay: isMobile ? 1 : 2,
            // 見出しの日付は全て YYYY/MM/DD にそろえる（所有者の要望、2026-09-23）。月は YYYY/MM
            monthYearSelectProps: { labelFormat: 'YYYY/MM' },
          }}
          weekViewProps={{
            startTime: '07:00:00',
            endTime: '22:00:00',
            intervalMinutes: 30,
            // 既定は「9月 21 – 9月 27, 2026」
            renderWeekLabel: ({ weekStart, weekEnd }) =>
              `${formatDateSlash(weekStart)} – ${formatDateSlash(weekEnd)}`,
          }}
          dayViewProps={{
            startTime: '07:00:00',
            endTime: '22:00:00',
            intervalMinutes: 30,
            // 既定は「9月 23, 2026」
            headerFormat: (d) => formatDateWithWeekday(dateKey(d)),
          }}
        />
        <Group gap="sm" wrap="wrap">
          <Group gap={6} wrap="nowrap">
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                display: 'inline-block',
                backgroundColor: 'var(--mantine-color-clay-6)',
              }}
            />
            <Text size="xs" c="dimmed">
              自分たちの予定
            </Text>
          </Group>
          <Group gap={6} wrap="nowrap">
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                display: 'inline-block',
                backgroundColor: 'var(--mantine-color-gray-5)',
              }}
            />
            <Text size="xs" c="dimmed">
              終わった予定
            </Text>
          </Group>
          <Group gap={6} wrap="nowrap">
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                display: 'inline-block',
                border: '1px solid var(--mantine-color-gray-6)',
              }}
            />
            <Text size="xs" c="dimmed">
              お知らせ（情報）
            </Text>
          </Group>
        </Group>
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
      <FormDrawer opened={planDefaults !== null} onClose={closePlan} title="予定を追加">
        {planDefaults ? (
          <EventForm
            event={null}
            defaults={planDefaults}
            targets={targets}
            places={places}
            onSaved={handlePlanSaved}
          />
        ) : null}
      </FormDrawer>
      <FormDrawer opened={editing !== null} onClose={() => setEditing(null)} title="予定を編集">
        {editing ? (
          <Stack gap="md">
            <EventForm
              event={editing}
              targets={targets}
              places={places}
              onSaved={() => setEditing(null)}
            />
            <Button color="red" variant="light" fullWidth onClick={() => handleDelete(editing)}>
              削除
            </Button>
          </Stack>
        ) : null}
      </FormDrawer>
      <FormDrawer
        opened={newsDrawerNews !== null}
        onClose={() => setNewsDrawerNewsId(null)}
        title="お知らせ"
      >
        {newsDrawerNews ? (
          <NewsEventDrawer
            news={newsDrawerNews}
            planning={false}
            onPlan={() => handlePlanVisit(newsDrawerNews)}
            onViewEvent={() => handleViewPlannedEvent(newsDrawerNews)}
          />
        ) : null}
      </FormDrawer>
    </PageShell>
  )
}
