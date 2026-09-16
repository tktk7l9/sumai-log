import { Title, VisuallyHidden } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'

import { PageShell } from '../components/PageShell'
import { HomeAgenda } from '../components/home/HomeAgenda'
import { HomeNews } from '../components/home/HomeNews'
import { PendingVisits } from '../components/home/PendingVisits'
import { RecentFeed } from '../components/home/RecentFeed'
import { UpcomingEvents } from '../components/home/UpcomingEvents'
import { listHomeEvents } from '../server/events'
import { recentFeed } from '../server/feed'
import { listVendorNews } from '../server/news'
// getSettings() 経由で members を取る（server/members.ts を route から直接 import
// すると、同ファイルの createServerFn でない currentActorEmail 等がクライアント
// バンドルに含まれてビルドが壊れるため。settings.tsx と同じ回避パターン）
import { getSettings } from '../server/settings'

// ホームの「お知らせ」ブロックは最新 5 件だけ（design.md §4「ホーム」）
const HOME_NEWS_LIMIT = 5

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => {
    // アジェンダ（これからの予定）ぶんの予定は listHomeEvents が agenda/agendaFrom/agendaTo
    // として一緒に返す（同じ 90 日〜365 日レンジを二重に問い合わせない）
    const [home, feed, { members }, { news }] = await Promise.all([
      listHomeEvents(),
      recentFeed(),
      getSettings(),
      listVendorNews({ data: { limit: HOME_NEWS_LIMIT } }),
    ])
    return { ...home, feed, members, news }
  },
})

function Home() {
  const { upcoming, pending, feed, members, agenda, agendaFrom, agendaTo, news } =
    Route.useLoaderData()
  return (
    // 節と節の間は PageShell の Stack（24px）が引き受ける。ここで入れ子にしない
    <PageShell>
      {/* 見出しブロックは見た目上不要（所有者の要望で外した）だが、h1 が無いと
          見出し階層が崩れる（HomeNews 等はすべて h2）。視覚的には隠しつつ
          支援技術には伝える。 */}
      <VisuallyHidden>
        <Title order={1}>住まいログ</Title>
      </VisuallyHidden>
      <UpcomingEvents events={upcoming} />
      <HomeAgenda events={agenda} rangeStart={agendaFrom} rangeEnd={agendaTo} />
      <HomeNews items={news} />
      <PendingVisits events={pending} />
      <RecentFeed items={feed} members={members} />
    </PageShell>
  )
}
