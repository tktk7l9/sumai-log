import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { listWorks, markWorkWatched, saveWorkVideo } from '../server/works'
import { mockOf, stub, uid, work } from '../../test/ui/fixtures'
import { renderRoute } from '../../test/ui/render'

function row(over: Parameters<typeof work>[0], vendorName: string | null = null) {
  return { ...work(over), vendorName }
}

const FULL = row(
  {
    id: uid(1),
    title: '全部そろった家',
    vendorId: 'v1',
    points: ['断熱性能：UA値0.31', '耐震等級3'],
    uaValue: 0.31,
    cValue: 0.6,
    family: '大人2人、子供1人',
    siteAreaTsubo: 50.5,
    floorAreaTsubo: 30.2,
    totalAreaTsubo: 33.15,
    layout: '2LDK＋書斎',
    youtubeVideoId: 'abcdefghijk',
  },
  '甲工務店',
)
const WATCHED = row(
  {
    id: uid(2),
    title: '見終わった家',
    vendorId: 'v1',
    youtubeVideoId: 'bbbbbbbbbbb',
    watchedAt: '2026-10-01T00:00:00.000Z',
    watchedBy: 'owner@example.com',
    sourceUrl: 'https://example.com/works/p2/',
  },
  '甲工務店',
)
const BARE = row(
  {
    id: uid(3),
    title: '名前だけの家',
    vendorId: 'v2',
    site: 'siteB',
    sourceUrl: 'https://example.com/works/p3/',
  },
  '乙建設',
)

describe('works route', () => {
  beforeEach(() => {
    stub(listWorks, [FULL, WATCHED, BARE])
    stub(markWorkWatched, { ok: true })
    stub(saveWorkVideo, { ok: true })
  })

  it('lists every work with its vendor, a link to the source and the watched count in words', async () => {
    await renderRoute('/works')
    expect(await screen.findByRole('heading', { name: '施工例', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('3 件中 1 件を視聴済み')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '全部そろった家 を元のページで開く' })).toHaveAttribute(
      'href',
      'https://example.com/works/p1/',
    )
    const watched = screen.getByRole('article', { name: '見終わった家' })
    expect(within(watched).getByText('視聴済み')).toBeInTheDocument()
    expect(
      within(screen.getByRole('article', { name: '全部そろった家' })).queryByText('視聴済み'),
    ).not.toBeInTheDocument()
  })

  it('shows the empty state when nothing has been imported', async () => {
    stub(listWorks, [])
    await renderRoute('/works')
    expect(await screen.findByText('施工例がまだありません')).toBeInTheDocument()
  })

  it('filters by vendor, by video and by unwatched, keeping the filter in the URL', async () => {
    const { user, router } = await renderRoute('/works')
    await user.click(await screen.findByRole('radio', { name: '乙建設' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ v: 'v2' }))
    expect(screen.queryByText('全部そろった家')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: '動画あり' }))
    expect(await screen.findByText('条件に合う施工例がありません')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'すべて' }))
    await user.click(screen.getByRole('checkbox', { name: 'まだ見ていない' }))
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ video: true, unwatched: true }),
    )
    expect(screen.getByText('全部そろった家')).toBeInTheDocument()
    expect(screen.queryByText('見終わった家')).not.toBeInTheDocument()
  })

  it('falls back to no filter for an unknown search value', async () => {
    await renderRoute('/works?view=nope&video=maybe')
    expect(await screen.findByText('名前だけの家')).toBeInTheDocument()
  })

  it('shows the same four blocks in the same order in the aligned view, and no row for a missing value', async () => {
    const { user, router } = await renderRoute('/works')
    await user.click(await screen.findByRole('radio', { name: '揃えて見る' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ view: 'spec' }))

    const full = within(screen.getByRole('article', { name: '全部そろった家' }))
    const terms = full.getAllByRole('term').map((el) => el.textContent)
    expect(terms).toEqual(['ポイント', '家族構成', '面積', '間取り'])
    expect(full.getByText('断熱性能：UA値0.31')).toBeInTheDocument()
    expect(full.getByText('敷地面積 50.5坪')).toBeInTheDocument()
    expect(full.getByText('延床面積 30.2坪')).toBeInTheDocument()
    expect(full.getByText('総施工面積 33.15坪')).toBeInTheDocument()
    expect(full.getByText('2LDK＋書斎')).toBeInTheDocument()

    const bare = within(screen.getByRole('article', { name: '名前だけの家' }))
    expect(bare.queryAllByRole('term')).toEqual([])
    expect(bare.queryByText('—')).not.toBeInTheDocument()
  })

  it('marks a work as watched by hand and takes it back', async () => {
    const { user } = await renderRoute('/works')
    const full = within(await screen.findByRole('article', { name: '全部そろった家' }))
    await user.click(full.getByRole('button', { name: '視聴済みにする' }))
    await waitFor(() =>
      expect(mockOf(markWorkWatched)).toHaveBeenCalledWith({ data: { id: uid(1), watched: true } }),
    )

    const watched = within(screen.getByRole('article', { name: '見終わった家' }))
    await user.click(watched.getByRole('button', { name: '視聴済みを取り消す' }))
    await waitFor(() =>
      expect(mockOf(markWorkWatched)).toHaveBeenCalledWith({
        data: { id: uid(2), watched: false },
      }),
    )
  })

  it('offers an undo after marking a work watched by hand, since the filter hides the card', async () => {
    const { user } = await renderRoute('/works?unwatched=true')
    const full = within(await screen.findByRole('article', { name: '全部そろった家' }))
    await user.click(full.getByRole('button', { name: '視聴済みにする' }))
    expect(await screen.findByText('視聴済みにしました')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '取り消す' }))
    await waitFor(() =>
      expect(mockOf(markWorkWatched)).toHaveBeenCalledWith({
        data: { id: uid(1), watched: false },
      }),
    )
  })

  it('says so when saving fails', async () => {
    mockOf(markWorkWatched).mockRejectedValue(new Error('boom'))
    const { user } = await renderRoute('/works')
    const full = within(await screen.findByRole('article', { name: '全部そろった家' }))
    await user.click(full.getByRole('button', { name: '視聴済みにする' }))
    expect(await screen.findByText('保存できませんでした')).toBeInTheDocument()
  })

  it('pastes a video URL for a work without one, rejecting what is not a YouTube URL', async () => {
    const { user } = await renderRoute('/works')
    const bare = within(await screen.findByRole('article', { name: '名前だけの家' }))
    await user.click(bare.getByRole('button', { name: '動画の URL を貼る' }))

    const dialog = within(await screen.findByRole('dialog'))
    await user.type(
      dialog.getByRole('textbox', { name: 'YouTube の URL' }),
      'https://example.com/x',
    )
    await user.click(dialog.getByRole('button', { name: '保存' }))
    expect(await dialog.findByText('YouTube の URL を入れてください')).toBeInTheDocument()
    expect(mockOf(saveWorkVideo)).not.toHaveBeenCalled()

    await user.clear(dialog.getByRole('textbox', { name: 'YouTube の URL' }))
    await user.type(
      dialog.getByRole('textbox', { name: 'YouTube の URL' }),
      'https://youtu.be/ccccccccccc',
    )
    await user.click(dialog.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(mockOf(saveWorkVideo)).toHaveBeenCalledWith({
        data: { id: uid(3), url: 'https://youtu.be/ccccccccccc' },
      }),
    )
  })

  it('offers to remove a video only when it was pasted by hand', async () => {
    stub(listWorks, [
      row({
        id: uid(4),
        title: '手で貼った家',
        youtubeVideoId: 'ddddddddddd',
        videoSource: 'manual',
      }),
    ])
    const { user } = await renderRoute('/works')
    const card = within(await screen.findByRole('article', { name: '手で貼った家' }))
    await user.click(card.getByRole('button', { name: '動画を変える' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: '動画を外す' }),
    )
    await waitFor(() =>
      expect(mockOf(saveWorkVideo)).toHaveBeenCalledWith({ data: { id: uid(4), url: null } }),
    )
  })

  it('plays the video in the app, marks it watched automatically and offers to take it back', async () => {
    const { user } = await renderRoute('/works')
    const full = within(await screen.findByRole('article', { name: '全部そろった家' }))
    await user.click(full.getByRole('button', { name: '動画を見る' }))

    const frame = (await screen.findByTitle(
      '全部そろった家 のルームツアー動画',
    )) as HTMLIFrameElement
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://www.youtube-nocookie.com',
        source: frame.contentWindow,
        data: JSON.stringify({ event: 'onStateChange', info: 0 }),
      }),
    )
    await waitFor(() =>
      expect(mockOf(markWorkWatched)).toHaveBeenCalledWith({ data: { id: uid(1), watched: true } }),
    )
    expect(await screen.findByText('視聴済みにしました')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '取り消す' }))
    await waitFor(() =>
      expect(mockOf(markWorkWatched)).toHaveBeenCalledWith({
        data: { id: uid(1), watched: false },
      }),
    )
  })

  it('does not write again when an already watched video is played to the end', async () => {
    const { user } = await renderRoute('/works')
    const watched = within(await screen.findByRole('article', { name: '見終わった家' }))
    await user.click(watched.getByRole('button', { name: '動画を見る' }))
    const frame = (await screen.findByTitle('見終わった家 のルームツアー動画')) as HTMLIFrameElement
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://www.youtube-nocookie.com',
        source: frame.contentWindow,
        data: JSON.stringify({ event: 'onStateChange', info: 0 }),
      }),
    )
    await new Promise((done) => setTimeout(done, 50))
    expect(mockOf(markWorkWatched)).not.toHaveBeenCalled()
  })
})
