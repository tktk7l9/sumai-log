import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { listHomeEvents } from '../server/events'
import { recentFeed } from '../server/feed'
import { pickGlossaryTerm } from '../server/glossary'
import { listVendorNews } from '../server/news'
import { getSettings } from '../server/settings'
import { MEMBERS, event, news, stub } from '../../test/ui/fixtures'
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
    stub(getSettings, { members: MEMBERS })
    stub(listVendorNews, { news: [{ ...news(), vendorName: 'テスト工務店' }] })
    stub(pickGlossaryTerm, {
      id: 'ua',
      term: 'UA値',
      reading: 'ユーエーち',
      summary: '断熱性能の指標',
    })
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
