import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { listNewsletters, listVendorNews, markNewsRead, newsSources } from '../server/news'
import { getMembers } from '../server/settings'
import { MEMBERS, mockOf, news, stub, uid } from '../../test/ui/fixtures'
import { renderRoute } from '../../test/ui/render'

const VENDOR = uid(71)

function row(over: Parameters<typeof news>[0]) {
  return { ...news(over), vendorName: 'テスト工務店' }
}

describe('news route', () => {
  beforeEach(() => {
    stub(listVendorNews, {
      news: [
        row({
          id: 'n1',
          title: '完成見学会のお知らせ',
          publishedOn: '2026-08-20',
          eventKind: '見学会',
          eventStart: '2099-08-29',
          eventEnd: '2099-08-29',
        }),
        row({
          id: 'n2',
          title: '夏季休業',
          publishedOn: '2026-08-05',
          url: 'mail:1',
          plannedEventId: 'e1',
          eventStart: '2026-08-10',
        }),
        row({
          id: 'n3',
          title: '構造見学会',
          publishedOn: '2026-08-05',
          eventKind: '見学会',
          eventStart: '2026-08-06',
          eventEnd: '2026-08-06',
        }),
      ],
    })
    stub(newsSources, {
      sources: [
        { id: VENDOR, name: 'テスト工務店' },
        { id: uid(72), name: 'サンプルハウス' },
      ],
    })
  })

  it('lists a month of vendor news, newest day first', async () => {
    await renderRoute('/news?m=2026-08')
    expect(await screen.findByText('2026/08')).toBeInTheDocument()
    expect(screen.getByText('2026/08/01 – 2026/08/31')).toBeInTheDocument()
    const days = screen.getAllByText(/^2026\/08\/\d\d（.）$/).map((el) => el.textContent)
    expect(days).toEqual(['2026/08/20（木）', '2026/08/05（水）'])
    expect(screen.getByText('メール')).toBeInTheDocument()
    expect(screen.getByText('予定あり')).toBeInTheDocument()
    expect(listVendorNews).toHaveBeenCalledWith({
      data: { vendorId: undefined, from: '2026-08-01', to: '2026-08-31', limit: 200, offset: 0 },
    })
  })

  it('moves between months and filters by vendor', async () => {
    const { user, router } = await renderRoute('/news?m=2026-08')
    await user.click(await screen.findByRole('button', { name: '前の月' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ m: '2026-07' }))
    await user.click(screen.getByRole('button', { name: '次の月' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ m: '2026-08' }))
    await user.click(screen.getByRole('radio', { name: 'テスト工務店' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ v: VENDOR }))
    expect(listVendorNews).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ vendorId: VENDOR }),
    })
  })

  it('returns from one vendor to all vendors', async () => {
    const { user, router } = await renderRoute(`/news?m=2026-08&v=${VENDOR}`)
    expect(await screen.findByRole('radio', { name: 'テスト工務店' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'すべて' }))
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('v'))
    expect(screen.getByRole('radio', { name: 'すべて' })).toBeChecked()
  })

  it('cannot go past the current month and says when a month is empty', async () => {
    stub(listVendorNews, { news: [] })
    stub(newsSources, { sources: [] })
    await renderRoute('/news')
    expect(await screen.findByText('この月のお知らせはありません')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '次の月' })).toBeDisabled()
    expect(screen.queryByRole('radio', { name: 'すべて' })).not.toBeInTheDocument()
  })

  it('plans a visit from news, opening the calendar with the form', async () => {
    const { user, router } = await renderRoute('/news?m=2026-08')
    await user.click(await screen.findByText('完成見学会のお知らせ'))
    const drawer = await screen.findByRole('dialog', { name: 'お知らせ' })
    await user.click(within(drawer).getByRole('button', { name: /に行く$/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/calendar'))
    expect(router.state.location.search).toEqual({ m: '2099-08', d: '2099-08-29', plan: 'n1' })
  })

  it('jumps to the planned event in the calendar', async () => {
    const { user, router } = await renderRoute('/news?m=2026-08')
    await user.click(await screen.findByText('夏季休業'))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'お知らせ' })).getByRole('button', {
        name: '予定を見る',
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/calendar'))
    expect(router.state.location.search).toEqual({ m: '2026-08', d: '2026-08-10' })
  })

  it('goes to today in the calendar when a planned news item has no date', async () => {
    stub(listVendorNews, { news: [row({ id: 'n4', title: '日付なし', plannedEventId: 'e1' })] })
    const { user, router } = await renderRoute('/news?m=2026-09')
    await user.click(await screen.findByText('日付なし'))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'お知らせ' })).getByRole('button', {
        name: '予定を見る',
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/calendar'))
    expect(router.state.location.search).toEqual({})
  })
})

describe('news route, newsletters tab', () => {
  const OTHER = uid(72)
  const UNREAD = uid(81)
  const READ = uid(82)

  beforeEach(() => {
    stub(listNewsletters, {
      news: [
        row({
          id: UNREAD,
          vendorId: VENDOR,
          title: '今月の見学会のご案内',
          publishedOn: '2026-09-20',
          url: 'mail:unread@example.com',
          mailId: uid(91),
          eventKind: '見学会',
          eventStart: '2099-09-27',
          eventEnd: '2099-09-27',
        }),
        {
          ...row({
            id: READ,
            vendorId: VENDOR,
            title: '夏季休業のお知らせ',
            publishedOn: '2026-08-01',
            url: 'mail:read@example.com',
            mailId: uid(92),
            readAt: '2026-08-02T00:00:00.000Z',
            readBy: 'partner@example.com',
          }),
        },
      ],
      vendors: [
        { vendorId: VENDOR, vendorName: 'テスト工務店', total: 2, unread: 1 },
        { vendorId: OTHER, vendorName: 'サンプルハウス', total: 3, unread: 0 },
      ],
    })
    stub(getMembers, { members: MEMBERS })
    stub(markNewsRead, { ok: true })
    // The way back to the monthly list
    stub(listVendorNews, { news: [] })
    stub(newsSources, { sources: [] })
  })

  it('lists every newsletter with its read state and who read it', async () => {
    await renderRoute('/news?tab=mail')
    expect(await screen.findByText('未読 1 通／全 5 通')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'テスト工務店（未読 1）' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'サンプルハウス' })).toBeInTheDocument()
    expect(screen.getByText('未読')).toBeInTheDocument()
    expect(screen.getByText('既読')).toBeInTheDocument()
    // MemberChip: the initial in the circle and the name beside it
    expect(screen.getAllByText('乙')).toHaveLength(2)
    expect(screen.getByText('2026/09/20（日）・テスト工務店')).toBeInTheDocument()
    expect(listNewsletters).toHaveBeenCalledWith({
      data: { vendorId: undefined, unreadOnly: undefined, limit: 50 },
    })
    expect(screen.queryByRole('button', { name: 'さらに表示' })).not.toBeInTheDocument()
  })

  it('switches between the monthly list and the newsletters, dropping the vendor', async () => {
    const { user, router } = await renderRoute(`/news?m=2026-08&v=${VENDOR}`)
    await user.click(await screen.findByRole('radio', { name: 'メルマガ' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ m: '2026-08', tab: 'mail' }))
    expect(await screen.findByText('未読 1 通／全 5 通')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '月ごと' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ m: '2026-08' }))
    expect(await screen.findByText('2026/08/01 – 2026/08/31')).toBeInTheDocument()
  })

  it('narrows to one vendor and to the unread ones', async () => {
    const { user, router } = await renderRoute('/news?tab=mail')
    await user.click(await screen.findByRole('radio', { name: 'テスト工務店（未読 1）' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ v: VENDOR }))
    expect(await screen.findByText('未読 1 通／全 2 通')).toBeInTheDocument()
    // With one vendor chosen the rows no longer repeat its name
    expect(screen.getByText('2026/09/20（日）')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: '未読だけ' }))
    await waitFor(() =>
      expect(listNewsletters).toHaveBeenLastCalledWith({
        data: { vendorId: VENDOR, unreadOnly: true, limit: 50 },
      }),
    )
    await user.click(screen.getByRole('radio', { name: 'すべて' }))
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('v'))
  })

  it('marks a newsletter read when opened, and takes it back from the drawer', async () => {
    const { user } = await renderRoute('/news?tab=mail')
    await user.click(await screen.findByText('今月の見学会のご案内'))
    await waitFor(() =>
      expect(markNewsRead).toHaveBeenCalledWith({ data: { id: UNREAD, read: true } }),
    )
    const drawer = await screen.findByRole('dialog', { name: 'お知らせ' })
    expect(within(drawer).getByText('今月の見学会のご案内')).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: /に行く$/ })).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: '既読にする' }))
    expect(markNewsRead).toHaveBeenLastCalledWith({ data: { id: UNREAD, read: true } })
    await user.keyboard('{Escape}')

    mockOf(markNewsRead).mockClear()
    await user.click(await screen.findByText('夏季休業のお知らせ'))
    const reopened = await screen.findByRole('dialog', { name: 'お知らせ' })
    expect(markNewsRead).not.toHaveBeenCalled()
    await user.click(within(reopened).getByRole('button', { name: '未読に戻す' }))
    await waitFor(() =>
      expect(markNewsRead).toHaveBeenCalledWith({ data: { id: READ, read: false } }),
    )
  })

  it('says so when the write fails', async () => {
    mockOf(markNewsRead).mockRejectedValue(new Error('offline'))
    const { user } = await renderRoute('/news?tab=mail')
    await user.click(await screen.findByText('今月の見学会のご案内'))
    expect(await screen.findByText('保存できませんでした')).toBeInTheDocument()
  })

  it('asks for more rows with 「さらに表示」 when a page is full', async () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      row({ id: uid(100 + i), title: `メルマガ ${i}`, url: `mail:${i}@example.com` }),
    )
    stub(listNewsletters, {
      news: many,
      vendors: [{ vendorId: VENDOR, vendorName: 'テスト工務店', total: 60, unread: 60 }],
    })
    const { user, router } = await renderRoute('/news?tab=mail')
    await user.click(await screen.findByRole('button', { name: 'さらに表示' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ n: 100 }))
    await waitFor(() =>
      expect(listNewsletters).toHaveBeenLastCalledWith({
        data: { vendorId: undefined, unreadOnly: undefined, limit: 100 },
      }),
    )
  })

  it('goes to the calendar from a newsletter, and says when there are none at all', async () => {
    const { user, router } = await renderRoute('/news?tab=mail')
    await user.click(await screen.findByText('今月の見学会のご案内'))
    const drawer = await screen.findByRole('dialog', { name: 'お知らせ' })
    await user.click(within(drawer).getByRole('button', { name: /に行く$/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/calendar'))
    expect(router.state.location.search).toEqual({ m: '2099-09', d: '2099-09-27', plan: UNREAD })

    stub(listNewsletters, { news: [], vendors: [] })
    await renderRoute('/news?tab=mail')
    expect(await screen.findByText('メルマガはまだありません')).toBeInTheDocument()
  })

  it('jumps to the planned event of a newsletter, or to today without a date', async () => {
    stub(listNewsletters, {
      news: [
        row({
          id: UNREAD,
          title: '日程あり',
          url: 'mail:a@example.com',
          plannedEventId: 'e1',
          eventStart: '2026-09-27',
        }),
        row({ id: READ, title: '日程なし', url: 'mail:b@example.com', plannedEventId: 'e2' }),
      ],
      vendors: [{ vendorId: VENDOR, vendorName: 'テスト工務店', total: 2, unread: 2 }],
    })
    const { user, router } = await renderRoute('/news?tab=mail')
    await user.click(await screen.findByText('日程あり'))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'お知らせ' })).getByRole('button', {
        name: '予定を見る',
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/calendar'))
    expect(router.state.location.search).toEqual({ m: '2026-09', d: '2026-09-27' })

    const second = await renderRoute('/news?tab=mail')
    await second.user.click(await screen.findByText('日程なし'))
    await second.user.click(
      within(await screen.findByRole('dialog', { name: 'お知らせ' })).getByRole('button', {
        name: '予定を見る',
      }),
    )
    await waitFor(() => expect(second.router.state.location.pathname).toBe('/calendar'))
    expect(second.router.state.location.search).toEqual({})
  })

  it('says when the filter matches nothing, and ignores a vendor that has none', async () => {
    stub(listNewsletters, {
      news: [],
      vendors: [{ vendorId: VENDOR, vendorName: 'テスト工務店', total: 1, unread: 0 }],
    })
    await renderRoute(`/news?tab=mail&v=${OTHER}&unread=true`)
    expect(await screen.findByText('該当するメルマガはありません')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'すべて' })).toBeChecked()
    expect(screen.getByText('未読 0 通／全 1 通')).toBeInTheDocument()
  })
})
