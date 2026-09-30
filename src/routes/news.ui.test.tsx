import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { listVendorNews, newsSources } from '../server/news'
import { news, stub, uid } from '../../test/ui/fixtures'
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
