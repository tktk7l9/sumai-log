import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { ROADMAP_STAGE_IDS } from '../lib/roadmap'
import { listHomeEvents } from '../server/events'
import { recentFeed } from '../server/feed'
import { pickGlossaryTerm } from '../server/glossary'
import { listVendorNews } from '../server/news'
import { getRoadmap, saveRoadmap } from '../server/roadmap'
import { getMembers } from '../server/settings'
import { listHomeTodos } from '../server/todos'
import { addVideoFromLink } from '../server/videos'
import { MEMBERS, event, mockOf, news, stub } from '../../test/ui/fixtures'
import { renderRoute } from '../../test/ui/render'

const NOW = '2026-10-01T09:00:00+09:00'

function links(e: ReturnType<typeof event>) {
  return { ...e, placeName: null, vendorName: null, propertyName: null }
}

describe('home route', () => {
  beforeEach(() => {
    stub(listHomeEvents, {
      pending: [links(event({ id: 'past', title: '完成見学会', startsAt: '2026-09-28' }))],
      agenda: [links(event({ id: 'next', title: '打合せ（間取り）', startsAt: '2026-10-05' }))],
      agendaFrom: '2026-10-01',
      agendaTo: '2026-10-05',
      nowIso: NOW,
    })
    stub(recentFeed, [
      {
        kind: 'visit',
        id: 'vi1',
        title: 'テスト展示場',
        action: 'created',
        at: '2026-09-30 01:00:00',
        by: 'partner@example.com',
        href: { to: '/records/visits/$id', params: { id: 'vi1' } },
      },
    ])
    stub(getMembers, { members: MEMBERS })
    stub(listVendorNews, { news: [{ ...news(), vendorName: 'テスト工務店' }] })
    stub(pickGlossaryTerm, {
      id: 'ua',
      term: 'UA値',
      reading: 'ユーエーち',
      summary: '断熱性能の指標',
    })
    stub(getRoadmap, {
      roadmap: { version: 1, stage: 'vendor' },
      relatedTerms: {
        ...Object.fromEntries(ROADMAP_STAGE_IDS.map((id) => [id, []])),
        contract: [{ id: 'sample-term', term: 'テスト用語' }],
      },
    })
    stub(listHomeTodos, { todos: [], todayKey: '2026-10-01' })
  })

  it('lists the to-dos that are overdue or due this week under the agenda, with a link to all', async () => {
    stub(listHomeTodos, {
      todayKey: '2026-10-01',
      todos: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          title: '銀行のパスキー',
          note: null,
          list: 'account',
          assignee: 'partner@example.com',
          dueOn: '2026-09-29',
          doneAt: null,
          doneBy: null,
          url: null,
          createdBy: 'owner@example.com',
          createdAt: '2026-09-01 00:00:00',
          updatedAt: '2026-09-01 00:00:00',
        },
      ],
    })
    await renderRoute('/')
    const heading = await screen.findByRole('heading', { name: 'やること' })
    expect(heading).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '銀行のパスキー' })).toHaveAttribute(
      'href',
      '/todos?edit=00000000-0000-4000-8000-000000000001',
    )
    expect(screen.getByText('期限 2日過ぎ')).toBeInTheDocument()
    const all = screen.getAllByRole('link', { name: 'すべて見る' })
    expect(all.some((a) => a.getAttribute('href') === '/todos')).toBe(true)
  })

  it('draws the roadmap above the agenda with the current stage marked', async () => {
    await renderRoute('/')
    const heading = await screen.findByRole('heading', { name: '家づくりのロードマップ' })
    const agenda = screen.getByRole('heading', { name: 'これからの予定' })
    expect(heading.compareDocumentPosition(agenda) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const figure = screen.getByRole('group', { name: /8 段階のうち、いまは 2 番目の「業者選び」/ })
    const stages = figure.querySelectorAll('.home-roadmap-stage')
    expect(stages).toHaveLength(8)
    expect(stages[0]).toHaveAttribute('data-state', 'done')
    expect(stages[1]).toHaveAttribute('data-state', 'current')
    expect(stages[2]).toHaveAttribute('data-state', 'todo')
    expect(within(figure).getByText('現在地')).toBeInTheDocument()
    expect(screen.getByText('現在地（2 / 8）')).toBeInTheDocument()
    expect(screen.getByText('候補を比べて相談する')).toBeInTheDocument()
  })

  it('opens what a tapped stage involves and can make it the current stage', async () => {
    stub(saveRoadmap, { ok: true, roadmap: { version: 1, stage: 'contract' } })
    const { user } = await renderRoute('/')
    await user.click(await screen.findByRole('button', { name: '5. 契約（これから）の説明を見る' }))
    const dialog = await screen.findByRole('dialog', { name: '5. 契約' })
    expect(within(dialog).getByText('これから')).toBeInTheDocument()
    expect(
      within(dialog).getByText('金額・工期・支払いの約束', { exact: false }),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('この段階でやること')).toBeInTheDocument()
    // The names of the glossary terms come with the roadmap (the page does not hold the glossary)
    expect(within(dialog).getByText('用語集で読む')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'テスト用語' })).toHaveAttribute(
      'href',
      '/glossary/sample-term',
    )
    await user.click(within(dialog).getByRole('button', { name: 'ここを現在地にする' }))
    expect(mockOf(saveRoadmap)).toHaveBeenCalledWith({ data: { stage: 'contract' } })
    expect(await screen.findByText('現在地を変更しました')).toBeInTheDocument()
  })

  it('does not offer to move to the stage that is already current', async () => {
    const { user } = await renderRoute('/')
    await user.click(
      await screen.findByRole('button', { name: '2. 業者選び（いまここ）の説明を見る' }),
    )
    const dialog = await screen.findByRole('dialog', { name: '2. 業者選び' })
    expect(within(dialog).getByText('いまここ')).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'ここを現在地にする' }),
    ).not.toBeInTheDocument()
    // A stage without related terms shows no empty 「用語集で読む」 heading
    expect(within(dialog).queryByText('用語集で読む')).not.toBeInTheDocument()
  })

  it('moves the current stage from 現在地を変更', async () => {
    stub(saveRoadmap, { ok: true, roadmap: { version: 1, stage: 'contract' } })
    const { user } = await renderRoute('/')
    await user.click(await screen.findByRole('button', { name: '現在地を変更' }))
    const dialog = await screen.findByRole('dialog', { name: '現在地を変更' })
    expect(within(dialog).getByRole('radio', { name: /2\. 業者選び/ })).toBeChecked()
    await user.click(within(dialog).getByRole('radio', { name: /5\. 契約/ }))
    await user.click(within(dialog).getByRole('button', { name: '現在地を保存' }))
    expect(mockOf(saveRoadmap)).toHaveBeenCalledWith({ data: { stage: 'contract' } })
    expect(await screen.findByText('現在地を変更しました')).toBeInTheDocument()
  })

  it('shows the agenda, the visit to write up, vendor news, a glossary term and the feed', async () => {
    await renderRoute('/')
    expect(await screen.findByRole('heading', { name: 'これからの予定' })).toBeInTheDocument()
    expect(screen.getByText('打合せ（間取り）')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '記録を書きませんか' })).toBeInTheDocument()
    expect(screen.getByText('完成見学会')).toBeInTheDocument()
    expect(screen.getByText('完成見学会のお知らせ')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'すべて見る' })).toHaveAttribute('href', '/news')
    expect(screen.getByText('UA値')).toBeInTheDocument()
    expect(screen.getByText('テスト展示場')).toBeInTheDocument()
    // The icon-only member circle of the feed row is announced by name
    expect(screen.getByRole('img', { name: '乙' })).toBeInTheDocument()
  })

  it('tags events of the next 7 days with a countdown and news of the last 7 days with New', async () => {
    stub(listHomeEvents, {
      pending: [],
      agenda: [
        links(event({ id: 'today', title: '現場確認', startsAt: '2026-10-01T15:00' })),
        links(event({ id: 'tomorrow', title: '資金相談', startsAt: '2026-10-02' })),
        links(event({ id: 'after', title: '土地の下見', startsAt: '2026-10-03' })),
        links(event({ id: 'soon', title: '打合せ（間取り）', startsAt: '2026-10-05' })),
        links(event({ id: 'week', title: '上棟式', startsAt: '2026-10-08T10:00' })),
        links(event({ id: 'later', title: '地鎮祭', startsAt: '2026-10-09T10:00' })),
      ],
      agendaFrom: '2026-10-01',
      agendaTo: '2026-10-20',
      nowIso: NOW,
    })
    stub(listVendorNews, {
      news: [
        { ...news(), vendorName: 'テスト工務店' },
        {
          ...news(),
          id: 'old',
          title: '古いお知らせ',
          publishedOn: '2026-09-20',
          vendorName: 'テスト工務店',
        },
      ],
    })
    await renderRoute('/')
    await screen.findByText('打合せ（間取り）')
    const tagOf = (title: string) => {
      const row = screen.getByText(title).closest('button') as HTMLElement
      return within(row).queryByText(/^(今日|明日|明後日|あと\d日)$/)?.textContent ?? null
    }
    expect(tagOf('現場確認')).toBe('今日')
    expect(tagOf('資金相談')).toBe('明日')
    expect(tagOf('土地の下見')).toBe('明後日')
    expect(tagOf('打合せ（間取り）')).toBe('あと4日')
    expect(tagOf('上棟式')).toBe('あと7日')
    expect(tagOf('地鎮祭')).toBeNull()
    const fresh = screen.getByText('完成見学会のお知らせ').closest('button')
    const old = screen.getByText('古いお知らせ').closest('button')
    expect(within(fresh as HTMLElement).getByText('New')).toBeInTheDocument()
    expect(within(old as HTMLElement).queryByText('New')).not.toBeInTheDocument()
  })

  it('omits the sections that have nothing to show', async () => {
    stub(listHomeEvents, {
      pending: [],
      agenda: [],
      agendaFrom: '2026-10-01',
      agendaTo: '2026-10-01',
      nowIso: NOW,
    })
    stub(listVendorNews, { news: [] })
    stub(pickGlossaryTerm, null)
    stub(recentFeed, [])
    await renderRoute('/')
    await screen.findByRole('heading', { name: 'これからの予定' })
    expect(screen.queryByRole('heading', { name: '記録を書きませんか' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '用語集から' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'すべて見る' })).not.toBeInTheDocument()
    const newsSection = screen.getByRole('heading', { name: 'お知らせ' }).parentElement!
    expect(within(newsSection).getByText('お知らせはありません')).toBeInTheDocument()
  })

  it('adds the video whose link was copied with one press, at the top of the page', async () => {
    stub(addVideoFromLink, {
      status: 'saved',
      id: '00000000-0000-4000-8000-000000000007',
      title: '平屋のルームツアー',
      markedWatched: false,
    })
    const { user } = await renderRoute('/')
    const add = await screen.findByRole('button', { name: 'コピーしたリンクから動画を追加' })
    // Above the roadmap: reachable without scrolling
    const roadmap = screen.getByRole('heading', { name: '家づくりのロードマップ' })
    expect(add.compareDocumentPosition(roadmap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await navigator.clipboard.writeText('https://youtu.be/dQw4w9WgXcQ?si=abcDEF123')
    const loads = mockOf(recentFeed).mock.calls.length

    await user.click(add)

    expect(await screen.findByText('保存しました：平屋のルームツアー')).toBeInTheDocument()
    // 「最近の更新」 at the bottom of the page shows the new memo
    expect(mockOf(recentFeed).mock.calls.length).toBeGreaterThan(loads)
  })
})
