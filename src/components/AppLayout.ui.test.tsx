import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { FeedItem } from '../lib/feed'
import { listCandidates } from '../server/candidates'
import { listHomeEvents } from '../server/events'
import { recentFeed } from '../server/feed'
import { pickGlossaryTerm } from '../server/glossary'
import { listVendorNews } from '../server/news'
import { getMembers } from '../server/settings'
import { MEMBERS, event, mockOf, stub } from '../../test/ui/fixtures'
import { renderRoute } from '../../test/ui/render'

/** Touch coordinates as both lists carry them (react-remove-scroll reads changedTouches too) */
function touchAt(clientY: number) {
  const touch = [{ clientX: 0, clientY }]
  return { touches: touch, changedTouches: touch }
}

function setPointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: coarse && query.includes('pointer: coarse'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

function feedItem(kind: FeedItem['kind'], over: Partial<FeedItem> = {}): FeedItem {
  return {
    kind,
    id: `${kind}-1`,
    title: `${kind}の題`,
    action: 'add',
    at: '2026-09-29 03:00:00',
    by: 'owner@example.com',
    href: { to: '/', params: { id: `${kind}-id` } },
    ...over,
  }
}

function stubHome(feed: FeedItem[] = []) {
  stub(listHomeEvents, {
    pending: [],
    agenda: [
      {
        ...event({ id: 'e1', title: '打合せ（外構）', startsAt: '2099-10-05T10:00:00+09:00' }),
        placeName: null,
        vendorName: null,
        propertyName: null,
      },
    ],
    agendaFrom: '2099-10-01',
    agendaTo: '2099-10-05',
    nowIso: '2099-10-01T09:00:00+09:00',
  })
  stub(recentFeed, feed)
  stub(getMembers, { members: MEMBERS })
  stub(listVendorNews, { news: [] })
  stub(pickGlossaryTerm, null)
}

describe('app layout', () => {
  beforeEach(() => {
    setPointer(false)
    stubHome()
  })
  afterEach(() => setPointer(false))

  it('marks the current page in the tabs and offers the other pages in a named menu', async () => {
    const { user, router } = await renderRoute('/')
    const tabs = await screen.findByRole('navigation', { name: '主要なページ' })
    expect(within(tabs).getByRole('link', { name: 'ホーム' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await user.click(screen.getByRole('button', { name: 'その他のページ' }))
    const menu = await screen.findByRole('menu')
    for (const label of ['用語集', '情報収集', '施工例', '区画', '分析', '設定']) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeInTheDocument()
    }
    await user.click(within(menu).getByRole('menuitem', { name: '用語集' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/glossary'))
  })

  it('shows a not-found page with a way home', async () => {
    await renderRoute('/no/such/page')
    expect(
      await screen.findByRole('heading', { level: 1, name: '見つかりません' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'ホームへ' }).length).toBeGreaterThan(0)
  })

  it('never shows a failed load as an empty list, and can retry', async () => {
    mockOf(listCandidates).mockRejectedValueOnce(new Error('D1 に接続できません'))
    const { user } = await renderRoute('/candidates')
    expect(
      await screen.findByRole('heading', { level: 1, name: '表示できませんでした' }),
    ).toBeInTheDocument()
    expect(screen.getByText('D1 に接続できません')).toBeInTheDocument()
    stub(listCandidates, { homeAreas: [], vendors: [], properties: [] })
    await user.click(screen.getByRole('button', { name: '読み直す' }))
    expect(await screen.findByText('業者がありません')).toBeInTheDocument()
  })

  it('reloads the page data when pulled down at the top on a touch screen', async () => {
    setPointer(true)
    await renderRoute('/')
    await screen.findByRole('heading', { name: '最近の更新' })
    const calls = mockOf(recentFeed).mock.calls.length
    const main = screen.getByRole('main')
    // A short pull does nothing
    fireEvent.touchStart(main, touchAt(100))
    fireEvent.touchMove(main, touchAt(120))
    fireEvent.touchEnd(main)
    // Pulling up resets
    fireEvent.touchStart(main, touchAt(100))
    fireEvent.touchMove(main, touchAt(80))
    fireEvent.touchEnd(main)
    expect(mockOf(recentFeed).mock.calls.length).toBe(calls)

    fireEvent.touchStart(main, touchAt(100))
    fireEvent.touchMove(main, touchAt(400))
    await act(async () => {
      fireEvent.touchEnd(main)
    })
    expect(await screen.findByText('更新中')).toBeInTheDocument()
    await waitFor(() => expect(mockOf(recentFeed).mock.calls.length).toBeGreaterThan(calls))
    await waitFor(() => expect(screen.queryByText('更新中')).not.toBeInTheDocument(), {
      timeout: 2000,
    })
  })

  it('does not pull to refresh from inside a drawer', async () => {
    setPointer(true)
    stub(listCandidates, { homeAreas: [], vendors: [], properties: [] })
    const { user } = await renderRoute('/candidates')
    await user.click(await screen.findByRole('button', { name: '業者を追加' }))
    const drawer = await screen.findByRole('dialog', { name: '候補を追加' })
    const calls = mockOf(listCandidates).mock.calls.length
    fireEvent.touchStart(drawer, touchAt(100))
    fireEvent.touchMove(drawer, touchAt(400))
    fireEvent.touchEnd(drawer)
    expect(screen.queryByText('更新中')).not.toBeInTheDocument()
    expect(mockOf(listCandidates).mock.calls.length).toBe(calls)
  })
})

describe('home page details', () => {
  beforeEach(() => setPointer(false))

  it('writes every kind of update as a sentence with a link to it', async () => {
    stubHome([
      feedItem('visit', { href: { to: '/records/visits/$id', params: { id: 'vi1' } } }),
      feedItem('photo', {
        subtitle: 'テスト展示場',
        href: { to: '/records/visits/$id', params: { id: 'vi1' } },
      }),
      feedItem('vendor', { href: { to: '/candidates/vendors/$id', params: { id: 'v1' } } }),
      feedItem('property', { href: { to: '/candidates/properties/$id', params: { id: 'p1' } } }),
      feedItem('place', { href: { to: '/places/$id', params: { id: 'pl1' } } }),
      feedItem('video', { href: { to: '/records/videos/$id', params: { id: 'vd1' } } }),
      feedItem('event', {
        action: 'update',
        href: { to: '/calendar', search: { d: '2026-10-05' } },
      }),
      feedItem('source', { href: { to: '/sources' } }),
      feedItem('comment', {
        id: 'c1',
        title: '良さそう',
        subtitle: 'テスト工務店',
        href: { to: '/candidates/vendors/$id', params: { id: 'v1' } },
      }),
      feedItem('comment', {
        id: 'c2',
        title: '古いコメント',
        subtitle: undefined,
        href: { to: '/somewhere-else' },
      }),
      feedItem('comment', {
        id: 'c3',
        title: '場所へのコメント',
        subtitle: 'テスト展示場',
        href: { to: '/places/$id', params: { id: 'pl1' } },
      }),
      feedItem('comment', {
        id: 'c4',
        title: '物件へのコメント',
        subtitle: 'テストレジデンス',
        href: { to: '/candidates/properties/$id', params: { id: 'p1' } },
      }),
      feedItem('comment', {
        id: 'c5',
        title: '動画へのコメント',
        subtitle: '断熱の話',
        href: { to: '/records/videos/$id', params: { id: 'vd1' } },
      }),
      feedItem('comment', {
        id: 'c6',
        title: '見学へのコメント',
        subtitle: 'テスト展示場',
        href: { to: '/records/visits/$id', params: { id: 'vi1' } },
      }),
    ])
    await renderRoute('/')
    expect(await screen.findByRole('link', { name: 'visitの題' })).toHaveAttribute(
      'href',
      '/records/visits/vi1',
    )
    expect(screen.getByRole('link', { name: 'vendorの題' })).toHaveAttribute(
      'href',
      '/candidates/vendors/v1',
    )
    expect(screen.getByRole('link', { name: 'propertyの題' })).toHaveAttribute(
      'href',
      '/candidates/properties/p1',
    )
    expect(screen.getByRole('link', { name: 'placeの題' })).toHaveAttribute('href', '/places/pl1')
    expect(screen.getByRole('link', { name: 'videoの題' })).toHaveAttribute(
      'href',
      '/records/videos/vd1',
    )
    expect(screen.getByRole('link', { name: 'eventの題' })).toHaveAttribute(
      'href',
      '/calendar?m=2026-10&d=2026-10-05',
    )
    expect(screen.getByRole('link', { name: 'sourceの題' })).toHaveAttribute('href', '/sources')
    // A comment on a target the app does not know stays plain text
    expect(screen.getByText('「（削除済み）」にコメント：古いコメント')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '（削除済み）' })).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('甲').length).toBeGreaterThan(0)
  })

  it('shows an empty feed', async () => {
    stubHome([])
    await renderRoute('/')
    expect(await screen.findByText('まだ更新がありません')).toBeInTheDocument()
  })

  it('opens the calendar at the day of a tapped event', async () => {
    stubHome([])
    const { user, router } = await renderRoute('/')
    await user.click(await screen.findByText('打合せ（外構）'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/calendar'))
    expect(router.state.location.search).toMatchObject({ m: '2099-10', d: '2099-10-05' })
  })
})
