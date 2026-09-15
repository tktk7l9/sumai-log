import { createFileRoute } from '@tanstack/react-router'

import { PageShell } from '../components/PageShell'
import { PendingVisits } from '../components/home/PendingVisits'
import { RecentFeed } from '../components/home/RecentFeed'
import { UpcomingEvents } from '../components/home/UpcomingEvents'
import { listHomeEvents } from '../server/events'
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
    return { ...home, feed, members }
  },
})

function Home() {
  const { upcoming, pending, feed, members } = Route.useLoaderData()
  return (
    // 節と節の間は PageShell の Stack（24px）が引き受ける。ここで入れ子にしない
    <PageShell title="住まいログ" description="二人の家探しの記録">
      <UpcomingEvents events={upcoming} />
      <PendingVisits events={pending} />
      <RecentFeed items={feed} members={members} />
    </PageShell>
  )
}
