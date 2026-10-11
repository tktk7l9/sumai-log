import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { listHomeEvents } from '../server/events'
import { recentFeed } from '../server/feed'
import { pickGlossaryTerm } from '../server/glossary'
import { listVendorNews } from '../server/news'
import { getRoadmap, saveRoadmap } from '../server/roadmap'
import { getMembers } from '../server/settings'
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
    stub(getRoadmap, { roadmap: { version: 1, stage: 'vendor' } })
  })

  it('draws the roadmap above the agenda with the current stage marked', async () => {
    await renderRoute('/')
    const heading = await screen.findByRole('heading', { name: '家づくりのロードマップ' })
    const agenda = screen.getByRole('heading', { name: 'これからの予定' })
    expect(heading.compareDocumentPosition(agenda) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const figure = screen.getByRole('img', { name: /8 段階のうち、いまは 2 番目の「業者選び」/ })
    const stages = figure.querySelectorAll('.home-roadmap-stage')
    expect(stages).toHaveLength(8)
    expect(stages[0]).toHaveAttribute('data-state', 'done')
    expect(stages[1]).toHaveAttribute('data-state', 'current')
    expect(stages[2]).toHaveAttribute('data-state', 'todo')
    expect(within(figure).getByText('現在地')).toBeInTheDocument()
    expect(screen.getByText('現在地（2 / 8）')).toBeInTheDocument()
    expect(screen.getByText('候補を比べて相談する')).toBeInTheDocument()
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
  })

  it('tags events of the next 7 days with 今週 and news of the last 7 days with New', async () => {
    stub(listHomeEvents, {
      pending: [],
      agenda: [
        links(event({ id: 'soon', title: '打合せ（間取り）', startsAt: '2026-10-05' })),
        links(event({ id: 'later', title: '地鎮祭', startsAt: '2026-10-20T10:00' })),
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
    const soon = (await screen.findByText('打合せ（間取り）')).closest('button')
    const later = screen.getByText('地鎮祭').closest('button')
    expect(within(soon as HTMLElement).getByText('今週')).toBeInTheDocument()
    expect(within(later as HTMLElement).queryByText('今週')).not.toBeInTheDocument()
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
})
