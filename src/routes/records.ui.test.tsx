import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getEvent } from '../server/events'
import { listVideos, saveVideo, videoFormOptions } from '../server/videos'
import { listVisits, saveVisit, visitFormOptions } from '../server/visits'
import { event, mockOf, place, stub, uid, video, visit } from '../../test/ui/fixtures'
import { renderRoute } from '../../test/ui/render'

const EVENT_ID = uid(21)

function visitRow(over: Parameters<typeof visit>[0] = {}) {
  return {
    ...visit(over),
    placeName: null,
    vendorName: null,
    propertyName: null,
    photoCount: 0,
    firstThumbKey: null,
  }
}

function placeRow() {
  return {
    ...place({ id: 'pl1', name: 'テスト展示場' }),
    vendorName: null,
    propertyName: null,
    visitCount: 0,
  }
}

describe('records route', () => {
  beforeEach(() => {
    stub(listVisits, [
      {
        ...visitRow({ id: 'vi1' }),
        placeName: 'テスト展示場',
        vendorName: 'テスト工務店',
        photoCount: 3,
        firstThumbKey: 'photos/vi1/ph1-thumb.jpg',
      },
      visitRow({ id: 'vi2', good: null }),
    ])
    stub(listVideos, [{ ...video(), vendorName: null }])
    stub(visitFormOptions, {
      targets: { vendors: [{ id: 'v1', name: 'テスト工務店' }], properties: [] },
      places: [placeRow()],
      events: [
        event({
          id: 'e1',
          title: '構造見学会',
          startsAt: '2026-09-27T10:00:00+09:00',
          placeId: 'pl1',
          vendorId: 'v1',
        }),
      ],
    })
    stub(videoFormOptions, {
      tags: ['断熱', '耐震'],
      vendors: [{ id: 'v1', name: 'テスト工務店' }],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists visit records by default', async () => {
    await renderRoute('/records')
    const first = await screen.findByRole('link', { name: /テスト展示場/ })
    expect(first).toHaveAttribute('href', '/records/visits/vi1')
    expect(within(first).getByText('テスト工務店')).toBeInTheDocument()
    expect(within(first).getByText('日当たりが良い')).toBeInTheDocument()
    expect(within(first).getByText('3 枚')).toBeInTheDocument()
    expect(within(first).getByText('2026/09/20')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /場所未設定/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '記録を書く' })).toBeInTheDocument()
  })

  it('switches to videos', async () => {
    const { user, router } = await renderRoute('/records')
    await user.click(await screen.findByText('動画 1'))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'videos' }))
    const card = screen.getByRole('link', { name: /断熱の基本を解説/ })
    expect(card).toHaveAttribute('href', '/records/videos/vd1')
    expect(within(card).getByText('テストチャンネル')).toBeInTheDocument()
    expect(within(card).getByText('断熱')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '動画メモを追加' })).toBeInTheDocument()
  })

  it('shows empty states for both tabs', async () => {
    stub(listVisits, [])
    stub(listVideos, [])
    const { user } = await renderRoute('/records')
    expect(await screen.findByText('見学記録がありません')).toBeInTheDocument()
    await user.click(screen.getByText('動画 0'))
    expect(await screen.findByText('観た動画のメモを残しましょう')).toBeInTheDocument()
  })

  it('writes a visit record from an event and opens it', async () => {
    const save = stub(saveVisit, { id: 'vi9' })
    const { user, router } = await renderRoute('/records')
    await user.click(await screen.findByRole('button', { name: '記録を書く' }))
    const drawer = await screen.findByRole('dialog', { name: '見学記録を書く' })
    // Choosing an event fills in the date, place and vendor
    await user.click(within(drawer).getByRole('combobox', { name: '予定' }))
    await user.click(await screen.findByRole('option', { name: /構造見学会/ }))
    await user.type(within(drawer).getByRole('textbox', { name: '良かった点' }), '天井が高い')
    await user.click(within(drawer).getByRole('button', { name: '記録を保存' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/records/visits/vi9'))
    expect(save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: 'e1',
        placeId: 'pl1',
        vendorId: 'v1',
        visitedOn: '2026-09-27',
        good: '天井が高い',
        concerns: null,
      }),
    })
  })

  it('opens the form prefilled when arriving from an event outside the option range', async () => {
    stub(getEvent, { event: event({ id: EVENT_ID, startsAt: '2025-01-05', placeId: 'pl1' }) })
    const save = stub(saveVisit, { conflict: true })
    const { user } = await renderRoute(`/records?fromEvent=${EVENT_ID}`)
    const drawer = await screen.findByRole('dialog', { name: '見学記録を書く' })
    expect(getEvent).toHaveBeenCalledWith({ data: { id: EVENT_ID } })
    await user.click(within(drawer).getByRole('button', { name: '記録を保存' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: EVENT_ID,
          placeId: 'pl1',
          visitedOn: '2025-01-05',
        }),
      }),
    )
    expect(await screen.findByText(/相手が先にこの内容を保存していた/)).toBeInTheDocument()
  })

  it('still opens the form when the event is gone', async () => {
    mockOf(getEvent).mockRejectedValue(new Response('Not Found', { status: 404 }))
    mockOf(saveVisit).mockRejectedValue(new Error('offline'))
    const { user, router } = await renderRoute(`/records?fromEvent=${EVENT_ID}`)
    const drawer = await screen.findByRole('dialog', { name: '見学記録を書く' })
    await user.click(within(drawer).getByRole('button', { name: '記録を保存' }))
    expect(await screen.findByText('保存できませんでした')).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: '閉じる' }))
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('fromEvent'))
  })

  it('fills a video memo from YouTube and keeps going with "続けて追加"', async () => {
    const save = stub(saveVideo, { id: 'vd2' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          videoId: 'zyxwvutsrqp',
          title: '気密測定の見学',
          channel: 'サンプル住宅ch',
          thumbnailUrl: 'https://i.ytimg.com/vi/zyxwvutsrqp/hqdefault.jpg',
          canonicalUrl: 'https://www.youtube.com/watch?v=zyxwvutsrqp',
        }),
      ),
    )
    const { user } = await renderRoute('/records?tab=videos')
    await user.click(await screen.findByRole('button', { name: '動画メモを追加' }))
    const drawer = await screen.findByRole('dialog', { name: '動画メモを書く' })
    const url = within(drawer).getByRole('textbox', { name: 'URL' })
    await user.type(url, 'https://youtu.be/zyxwvutsrqp')
    fireEvent.blur(url)
    expect(await screen.findByText('取得しました')).toBeInTheDocument()
    expect(within(drawer).getByRole('textbox', { name: '題名' })).toHaveValue('気密測定の見学')
    expect(within(drawer).getByRole('textbox', { name: 'チャンネル' })).toHaveValue(
      'サンプル住宅ch',
    )

    await user.click(within(drawer).getByRole('button', { name: '保存して続けて追加' }))
    expect(await screen.findByText('保存しました：気密測定の見学')).toBeInTheDocument()
    expect(save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        url: 'https://www.youtube.com/watch?v=zyxwvutsrqp',
        title: '気密測定の見学',
      }),
    })
    // The form is emptied for the next video and stays open
    expect(within(drawer).getByRole('textbox', { name: 'URL' })).toHaveValue('')
    expect(within(drawer).getByRole('textbox', { name: '題名' })).toHaveValue('')
  })

  it('asks for a title when YouTube cannot be reached and rejects other sites', async () => {
    const save = stub(saveVideo, { id: 'vd3' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 502 }))
    const { user, router } = await renderRoute('/records?tab=videos')
    await user.click(await screen.findByRole('button', { name: '動画メモを追加' }))
    const drawer = await screen.findByRole('dialog', { name: '動画メモを書く' })
    const url = within(drawer).getByRole('textbox', { name: 'URL' })
    await user.type(url, 'https://example.com/video')
    fireEvent.blur(url)
    expect(await within(drawer).findByText('YouTube の URL を入れてください')).toBeInTheDocument()

    await user.clear(url)
    await user.type(url, 'https://youtu.be/abcdefghijk')
    fireEvent.blur(url)
    expect(
      await within(drawer).findByText('自動取得できませんでした。題名を入力してください'),
    ).toBeInTheDocument()
    await user.type(within(drawer).getByRole('textbox', { name: '題名' }), '手入力の題名')
    await user.click(within(drawer).getByRole('button', { name: '動画メモを保存' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/records/videos/vd3'))
    expect(save).toHaveBeenCalledWith({ data: expect.objectContaining({ title: '手入力の題名' }) })
  })
})
