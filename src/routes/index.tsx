import { createFileRoute } from '@tanstack/react-router'

import { PageShell } from '../components/PageShell'
import { HomeAgenda } from '../components/home/HomeAgenda'
import { PendingVisits } from '../components/home/PendingVisits'
import { RecentFeed } from '../components/home/RecentFeed'
import { UpcomingEvents } from '../components/home/UpcomingEvents'
import { addDays } from '../lib/calendar'
import { listEventsBetween, listHomeEvents } from '../server/events'
import { recentFeed } from '../server/feed'
// getSettings() 経由で members を取る（server/members.ts を route から直接 import
// すると、同ファイルの createServerFn でない currentActorEmail 等がクライアント
// バンドルに含まれてビルドが壊れるため。settings.tsx と同じ回避パターン）
import { getSettings } from '../server/settings'

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => {
    const [home, feed, { members }] = await Promise.all([
      listHomeEvents(),
      recentFeed(),
      getSettings(),
    ])
    // アジェンダ（これからの予定）は今日から 4 週間ぶん。todayKey はサーバー側の
    // 「今」（listHomeEvents の nowIso）から出す。もう一往復増やさないために
    // nowIso の日付部分をそのまま使う
    const todayKey = home.nowIso.slice(0, 10)
    const rangeEndKey = addDays(todayKey, 27)
    const agenda = await listEventsBetween({ data: { from: todayKey, to: rangeEndKey } })
    return { ...home, feed, members, todayKey, agendaEvents: agenda.events }
  },
})

function Home() {
  const { upcoming, pending, feed, members, todayKey, agendaEvents } = Route.useLoaderData()
  return (
    // 節と節の間は PageShell の Stack（24px）が引き受ける。ここで入れ子にしない
    <PageShell title="住まいログ" description="二人の家探しの記録" inlineDescription>
      <UpcomingEvents events={upcoming} />
      <HomeAgenda events={agendaEvents} todayKey={todayKey} />
      <PendingVisits events={pending} />
      <RecentFeed items={feed} members={members} />
    </PageShell>
  )
}
