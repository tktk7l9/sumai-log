import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { deleteEvent, listEventsBetween, saveEvent } from '../server/events'
import { getMailBody } from '../server/mails'
import { getVendorNews, linkNewsToEvent, newsEventsBetween } from '../server/news'
import { listLinkTargets, listPlaces } from '../server/places'
import { event, mockOf, news, place, stub, uid } from '../../test/ui/fixtures'
import { flushPendingDeletes, renderRoute } from '../../test/ui/render'

// Far in the future so that "行く" (Go) is offered whatever day the tests run on
const MONTH = '2099-10'
const NEWS_ID = uid(61)

function links(e: ReturnType<typeof event>) {
  return { ...e, placeName: null, vendorName: null, propertyName: null }
}
function newsRow(over: Parameters<typeof news>[0] = {}) {
  return { ...news(over), vendorName: 'テスト工務店' }
}

const OPEN_HOUSE = newsRow({
  id: NEWS_ID,
  title: '完成見学会',
  eventStart: '2099-10-18',
  eventEnd: '2099-10-19',
  eventKind: '見学会',
})

function setMobile(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: mobile && query.includes('max-width'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

describe('calendar route', () => {
  beforeEach(() => {
    setMobile(false)
    stub(listEventsBetween, {
      events: [
        links(
          event({
            id: 'e1',
            title: '打合せ（間取り）',
            kind: 'meeting',
            startsAt: '2099-10-10T10:00:00+09:00',
          }),
        ),
      ],
      recordedEventIds: [],
      todayKey: '2099-10-01',
      nowIso: '2099-10-01T09:00:00+09:00',
    })
    stub(listLinkTargets, { vendors: [{ id: 'v1', name: 'テスト工務店' }], properties: [] })
    stub(listPlaces, [
      {
        ...place({ id: 'pl1', name: 'テスト展示場', vendorId: 'v1' }),
        vendorName: 'テスト工務店',
        propertyName: null,
        visited: false,
      },
    ])
    stub(newsEventsBetween, { news: [OPEN_HOUSE] })
  })

  afterEach(() => {
    setMobile(false)
  })

  it('shows own events and vendor news in the month', async () => {
    await renderRoute(`/calendar?m=${MONTH}`)
    expect(await screen.findByText('打合せ（間取り）')).toBeInTheDocument()
    expect(screen.getAllByText('テスト工務店 完成見学会').length).toBeGreaterThan(0)
    expect(screen.getByText('自分たちの予定')).toBeInTheDocument()
    expect(screen.getByText('お知らせ（情報）')).toBeInTheDocument()
    expect(listEventsBetween).toHaveBeenCalledWith({
      data: { from: '2099-09-24', to: '2099-11-07' },
    })
  })

  it('edits an event from the calendar, and deletes it with undo', async () => {
    const save = stub(saveEvent, { id: 'e1' })
    const remove = stub(deleteEvent, { ok: true })
    const { user } = await renderRoute(`/calendar?m=${MONTH}`)
    await user.click(await screen.findByText('打合せ（間取り）'))
    const drawer = await screen.findByRole('dialog', { name: '予定を編集' })
    expect(within(drawer).getByRole('textbox', { name: 'タイトル' })).toHaveValue(
      '打合せ（間取り）',
    )
    await user.click(within(drawer).getByRole('checkbox', { name: '終日' }))
    expect(within(drawer).queryByLabelText('開始')).not.toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: '予定を保存' }))
    expect(await screen.findByText('予定を更新しました')).toBeInTheDocument()
    expect(save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'e1',
        allDay: true,
        date: '2099-10-10',
        title: '打合せ（間取り）',
      }),
    })

    await user.click(screen.getByText('打合せ（間取り）'))
    const again = await screen.findByRole('dialog', { name: '予定を編集' })
    await user.click(within(again).getByRole('button', { name: 'この予定を削除' }))
    expect(await screen.findByText('「打合せ（間取り）」を削除しました')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('打合せ（間取り）')).not.toBeInTheDocument())
    flushPendingDeletes()
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(expect.objectContaining({ data: { id: 'e1' } })),
    )
  })

  it('adds an event whose title comes from the chosen place', async () => {
    const save = stub(saveEvent, { id: 'e2' })
    const { user } = await renderRoute(`/calendar?m=${MONTH}&d=2099-10-12`)
    await user.click(await screen.findByRole('button', { name: '予定を追加' }))
    const drawer = await screen.findByRole('dialog', { name: '予定を追加' })
    await user.click(within(drawer).getByRole('combobox', { name: '場所' }))
    await user.click(await screen.findByRole('option', { name: 'テスト展示場' }))
    expect(within(drawer).getByRole('textbox', { name: 'タイトル' })).toHaveAttribute(
      'placeholder',
      'テスト工務店 見学',
    )
    await user.click(within(drawer).getByRole('button', { name: '予定を保存' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'テスト工務店 見学',
          date: '2099-10-12',
          startTime: '10:00',
          placeId: 'pl1',
          vendorId: 'v1',
        }),
      }),
    )
  })

  it('asks for a title or a vendor/place before saving', async () => {
    const save = stub(saveEvent, { conflict: true })
    const { user } = await renderRoute(`/calendar?m=${MONTH}`)
    await user.click(await screen.findByRole('button', { name: '予定を追加' }))
    const drawer = await screen.findByRole('dialog', { name: '予定を追加' })
    await user.click(within(drawer).getByRole('button', { name: '予定を保存' }))
    expect(
      await within(drawer).findByText('タイトルか、業者・場所を入れてください'),
    ).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
    await user.type(within(drawer).getByRole('textbox', { name: 'タイトル' }), '銀行の相談')
    await user.click(within(drawer).getByRole('button', { name: '予定を保存' }))
    expect(await screen.findByText(/相手が先にこの内容を保存していた/)).toBeInTheDocument()
  })

  it('tells when an event could not be saved', async () => {
    mockOf(saveEvent).mockRejectedValue(new Error('offline'))
    const { user } = await renderRoute(`/calendar?m=${MONTH}`)
    await user.click(await screen.findByRole('button', { name: '予定を追加' }))
    const drawer = await screen.findByRole('dialog', { name: '予定を追加' })
    await user.type(within(drawer).getByRole('textbox', { name: 'タイトル' }), '銀行の相談')
    await user.click(within(drawer).getByRole('button', { name: '予定を保存' }))
    expect(await screen.findByText('保存できませんでした')).toBeInTheDocument()
  })

  it('plans a visit from vendor news and links it after saving', async () => {
    stub(getVendorNews, { news: OPEN_HOUSE })
    stub(saveEvent, { id: 'e3' })
    const link = stub(linkNewsToEvent, { eventId: 'e3' })
    const { user, router } = await renderRoute(`/calendar?m=${MONTH}`)
    await user.click((await screen.findAllByText('テスト工務店 完成見学会'))[0]!)
    const drawer = await screen.findByRole('dialog', { name: 'お知らせ' })
    expect(within(drawer).getByRole('link', { name: '完成見学会' })).toHaveAttribute(
      'href',
      'https://example.com/news/1',
    )
    expect(within(drawer).getByText(/見学会 2099\/10\/18/)).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: /に行く$/ }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ plan: NEWS_ID }))

    const form = await screen.findByRole('dialog', { name: '予定を追加' })
    expect(within(form).getByRole('textbox', { name: 'タイトル' })).toHaveValue(
      'テスト工務店 完成見学会',
    )
    await user.click(within(form).getByRole('button', { name: '予定を保存' }))
    await waitFor(() =>
      expect(link).toHaveBeenCalledWith({ data: { newsId: NEWS_ID, eventId: 'e3' } }),
    )
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('plan'))
  })

  it('reports a failed link but still closes the plan form', async () => {
    stub(getVendorNews, { news: OPEN_HOUSE })
    stub(saveEvent, { id: 'e3' })
    mockOf(linkNewsToEvent).mockRejectedValue(new Error('お知らせが見つかりません'))
    const { user, router } = await renderRoute(`/calendar?m=${MONTH}&plan=${NEWS_ID}`)
    const form = await screen.findByRole('dialog', { name: '予定を追加' })
    await user.click(within(form).getByRole('button', { name: '予定を保存' }))
    expect(await screen.findByText('お知らせが見つかりません')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('plan'))
  })

  it('goes from planned vendor news to the own event', async () => {
    stub(newsEventsBetween, { news: [{ ...OPEN_HOUSE, plannedEventId: 'e1' }] })
    const { user } = await renderRoute(`/calendar?m=${MONTH}`)
    await user.click((await screen.findAllByText('テスト工務店 完成見学会'))[0]!)
    const drawer = await screen.findByRole('dialog', { name: 'お知らせ' })
    await user.click(within(drawer).getByRole('button', { name: '予定を見る' }))
    expect(await screen.findByRole('dialog', { name: '予定を編集' })).toBeInTheDocument()
  })

  it('shows the body of news that came by mail', async () => {
    stub(newsEventsBetween, {
      news: [
        {
          ...OPEN_HOUSE,
          url: 'mail:abc',
          mailId: 'm1',
          eventStart: '2000-01-05',
          eventEnd: '2000-01-05',
        },
      ],
    })
    stub(getMailBody, { body: 'ご来場をお待ちしています' })
    stub(listEventsBetween, {
      events: [],
      recordedEventIds: [],
      todayKey: '2000-01-01',
      nowIso: '2000-01-01T09:00:00+09:00',
    })
    const { user } = await renderRoute('/calendar?m=2000-01')
    await user.click((await screen.findAllByText('テスト工務店 完成見学会'))[0]!)
    const drawer = await screen.findByRole('dialog', { name: 'お知らせ' })
    expect(within(drawer).getByText('メール')).toBeInTheDocument()
    expect(within(drawer).getByText('この日程は終了しました')).toBeInTheDocument()
    expect(await within(drawer).findByText('ご来場をお待ちしています')).toBeInTheDocument()
  })

  it('says when a mail body cannot be read', async () => {
    stub(newsEventsBetween, { news: [{ ...OPEN_HOUSE, url: 'mail:abc', mailId: 'm1' }] })
    mockOf(getMailBody).mockRejectedValue(new Error('gone'))
    const { user } = await renderRoute(`/calendar?m=${MONTH}`)
    await user.click((await screen.findAllByText('テスト工務店 完成見学会'))[0]!)
    expect(await screen.findByText('本文を読み込めませんでした。')).toBeInTheDocument()
  })

  it('lists the month with full titles and offers "今日" on a phone', async () => {
    setMobile(true)
    const { user, router } = await renderRoute(`/calendar?m=${MONTH}`)
    expect(await screen.findByRole('heading', { name: '2099/10 の予定' })).toBeInTheDocument()
    // Ours comes first, above the calendar (the calendar's own is hidden by CSS on a phone)
    await user.click(screen.getAllByRole('button', { name: '今日' })[0]!)
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ m: '2099-10', d: '2099-10-01' }),
    )
  })

  it('loads the week of the chosen view and moves by week', async () => {
    const { user, router } = await renderRoute(`/calendar?m=${MONTH}&d=2099-10-10&v=week`)
    await screen.findAllByText('打合せ（間取り）')
    expect(listEventsBetween).toHaveBeenCalledWith({
      data: { from: '2099-10-05', to: '2099-10-11' },
    })
    await user.click(screen.getByRole('button', { name: '次へ' }))
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        m: '2099-10',
        d: '2099-10-12',
        v: 'week',
      }),
    )
  })

  it('loads a single day in the day view', async () => {
    await renderRoute(`/calendar?d=2099-10-10&v=day`)
    await screen.findAllByText('打合せ（間取り）')
    expect(listEventsBetween).toHaveBeenCalledWith({
      data: { from: '2099-10-10', to: '2099-10-10' },
    })
    expect(screen.getByText('2099/10/10（土）')).toBeInTheDocument()
  })
})
