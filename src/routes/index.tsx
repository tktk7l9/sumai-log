import { Title, VisuallyHidden } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'

import { PageShell } from '../components/PageShell'
import { GlossaryPick } from '../components/home/GlossaryPick'
import { HomeAgenda } from '../components/home/HomeAgenda'
import { HomeNews } from '../components/home/HomeNews'
import { PendingVisits } from '../components/home/PendingVisits'
import { RecentFeed } from '../components/home/RecentFeed'
import { dateKey } from '../lib/calendar'
import { listHomeEvents } from '../server/events'
import { recentFeed } from '../server/feed'
import { pickGlossaryTerm } from '../server/glossary'
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
    const [home, feed, { members }, { news }, glossaryPick] = await Promise.all([
      listHomeEvents(),
      recentFeed(),
      getSettings(),
      listVendorNews({ data: { limit: HOME_NEWS_LIMIT } }),
      pickGlossaryTerm(),
    ])
    return { ...home, feed, members, news, glossaryPick }
  },
})

function Home() {
  const { pending, feed, members, agenda, agendaFrom, agendaTo, news, glossaryPick, nowIso } =
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
      {/* 「今」はサーバー（listHomeEvents）が決めた値を使う。終わった予定・終わった
          日程のお知らせは色を落とす（所有者の要望、2026-09-21） */}
      <HomeAgenda events={agenda} rangeStart={agendaFrom} rangeEnd={agendaTo} nowIso={nowIso} />
      <HomeNews items={news} todayKey={dateKey(nowIso)} />
      <PendingVisits events={pending} />
      {/* 日替わりの用語は読み物なので、予定・お知らせ・書きかけの後に置く（先頭に置くと
          主目的の予定が下に押される） */}
      <GlossaryPick term={glossaryPick} />
      <RecentFeed items={feed} members={members} />
    </PageShell>
  )
}
