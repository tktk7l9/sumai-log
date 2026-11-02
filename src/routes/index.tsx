import { Title, VisuallyHidden } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'

import { PageShell } from '../components/PageShell'
import { GlossaryPick } from '../components/home/GlossaryPick'
import { HomeAgenda } from '../components/home/HomeAgenda'
import { HomeNews } from '../components/home/HomeNews'
import { HomeRoadmap } from '../components/home/HomeRoadmap'
import { HomeTodos } from '../components/home/HomeTodos'
import { PendingVisits } from '../components/home/PendingVisits'
import { RecentFeed } from '../components/home/RecentFeed'
import { usePendingDeletes } from '../components/undoableDelete'
import { dateKey } from '../lib/calendar'
import { hidePendingOnHome } from '../lib/deferredDelete'
import { listHomeEvents } from '../server/events'
import { recentFeed } from '../server/feed'
import { pickGlossaryTerm } from '../server/glossary'
import { listVendorNews } from '../server/news'
import { getRoadmap } from '../server/roadmap'
import { listHomeTodos } from '../server/todos'
// Get members through a server function (importing server/members.ts directly from a route
// puts currentActorEmail and others in that file that are not createServerFn into the client
// bundle and breaks the build. Same workaround pattern as settings.tsx)
import { getMembers } from '../server/settings'

// The "お知らせ" (vendor news) block on the home page shows only the latest 5 items
// (design.md §4 "ホーム" (Home))
const HOME_NEWS_LIMIT = 5

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => {
    // The events for the agenda (upcoming events) are returned together by listHomeEvents as
    // agenda/agendaFrom/agendaTo (the same 90 day to 365 day range is not queried twice)
    const [home, feed, { members }, { news }, glossaryPick, { roadmap }, homeTodos] =
      await Promise.all([
        listHomeEvents(),
        recentFeed(),
        getMembers(),
        listVendorNews({ data: { limit: HOME_NEWS_LIMIT } }),
        pickGlossaryTerm(),
        getRoadmap(),
        listHomeTodos(),
      ])
    return { ...home, feed, members, news, glossaryPick, roadmap, homeTodos }
  },
})

function Home() {
  // Items whose deletion can still be undone are hidden here too, the same as in the lists
  // (e.g. delete an event, then come home within the undo window)
  const pendingDeletes = usePendingDeletes()
  const {
    pending,
    feed,
    members,
    agenda,
    agendaFrom,
    agendaTo,
    news,
    glossaryPick,
    nowIso,
    roadmap,
    homeTodos,
  } = hidePendingOnHome(Route.useLoaderData(), pendingDeletes)
  return (
    // The Stack of PageShell (24px) takes care of the gap between sections. Do not nest here
    <PageShell>
      {/* The heading block is not needed visually (removed at the owner's request), but without
          an h1 the heading hierarchy breaks (HomeNews and the others are all h2). Hide it
          visually while still exposing it to assistive technology. */}
      <VisuallyHidden>
        <Title order={1}>住まいログ</Title>
      </VisuallyHidden>
      {/* Where the two of them are in building the house, above the events, so that the big
          picture comes before the dates (owner's request, 2026-10-11) */}
      <HomeRoadmap roadmap={roadmap} />
      {/* "Now" uses the value decided by the server (listHomeEvents). Finished events and vendor
          news whose dates have passed are dimmed (owner's request, 2026-09-21) */}
      <HomeAgenda events={agenda} rangeStart={agendaFrom} rangeEnd={agendaTo} nowIso={nowIso} />
      {/* Household to-dos that are overdue or due this week, right after the dates (the move
          and the account cleanup are what the two of them are doing now, 2026-10-28) */}
      <HomeTodos
        todos={homeTodos.todos.filter((t) => !pendingDeletes.has(t.id))}
        members={members}
        todayKey={homeTodos.todayKey}
      />
      {/* The call to the major task (writing up a visit) comes right after the events, above
          vendor news, which grows with every fetch (SHIG 20) */}
      <PendingVisits events={pending} />
      <HomeNews items={news} todayKey={dateKey(nowIso)} />
      {/* The daily glossary term is reading material, so it goes after events, vendor news and
          unfinished records (at the top it pushes down the events, which are the main purpose) */}
      <GlossaryPick term={glossaryPick} />
      <RecentFeed items={feed} members={members} />
    </PageShell>
  )
}
