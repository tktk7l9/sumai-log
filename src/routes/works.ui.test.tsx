import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { listChannelVideosPage, markChannelVideoWatched } from '../server/channelVideos'
import type { ChannelVideoRow } from '../server/repository/channelVideos'
import { listWorks, markWorkWatched, saveWorkVideo } from '../server/works'
import { mockOf, stub, uid, work } from '../../test/ui/fixtures'
import { renderRoute } from '../../test/ui/render'

function row(
  over: Parameters<typeof work>[0],
  vendorName: string | null = null,
  videoDurationSec: number | null = null,
) {
  return { ...work(over), vendorName, videoDurationSec }
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
  754,
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
    await renderRoute('/works?tab=works')
    // The h1 is the tab's name and is read by assistive technology only; the segmented
    // control is what is seen
    expect(await screen.findByRole('heading', { name: '動画', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '施工例' })).toBeChecked()
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

  it('shows the count per vendor, and the watched count follows the chosen vendor', async () => {
    const { user } = await renderRoute('/works?tab=works')
    expect(await screen.findByRole('radio', { name: '甲工務店 2' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '甲工務店 2' }))
    expect(await screen.findByText('2 件中 1 件を視聴済み')).toBeInTheDocument()
  })

  it('shows family, layout, points and the video length in the plain list too', async () => {
    await renderRoute('/works?tab=works')
    const full = within(await screen.findByRole('article', { name: '全部そろった家' }))
    expect(full.getByText(/^延床 30.2坪\s+UA値 0.31\s+C値 0.6$/)).toBeInTheDocument()
    expect(full.getByText('大人2人、子供1人・2LDK＋書斎')).toBeInTheDocument()
    expect(full.getByText('断熱性能：UA値0.31／耐震等級3')).toBeInTheDocument()
    expect(full.getByRole('button', { name: '動画を見る（12:34）' })).toBeInTheDocument()
    // No length known: the plain wording
    const watched = within(screen.getByRole('article', { name: '見終わった家' }))
    expect(watched.getByRole('button', { name: '動画を見る' })).toBeInTheDocument()
  })

  it('shows the empty state when nothing has been imported', async () => {
    stub(listWorks, [])
    await renderRoute('/works?tab=works')
    expect(await screen.findByText('施工例がまだありません')).toBeInTheDocument()
  })

  it('filters by vendor, by video and by unwatched, keeping the filter in the URL', async () => {
    const { user, router } = await renderRoute('/works?tab=works')
    await user.click(await screen.findByRole('radio', { name: '乙建設 1' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: 'works', v: 'v2' }))
    expect(screen.queryByText('全部そろった家')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: '動画あり' }))
    expect(await screen.findByText('条件に合う施工例がありません')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'すべて 3' }))
    await user.click(screen.getByRole('checkbox', { name: 'まだ見ていない' }))
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: 'works', video: true, unwatched: true }),
    )
    expect(screen.getByText('全部そろった家')).toBeInTheDocument()
    expect(screen.queryByText('見終わった家')).not.toBeInTheDocument()
  })

  it('treats an unknown vendor id as no filter', async () => {
    await renderRoute('/works?tab=works&v=nope')
    expect(await screen.findByText('名前だけの家')).toBeInTheDocument()
    expect(screen.getByText('全部そろった家')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'すべて 3' })).toBeChecked()
  })

  it('falls back to no filter for an unknown search value', async () => {
    await renderRoute('/works?tab=works&view=nope&video=maybe')
    expect(await screen.findByText('名前だけの家')).toBeInTheDocument()
  })

  it('shows the same four blocks in the same order in the aligned view, and no row for a missing value', async () => {
    const { user, router } = await renderRoute('/works?tab=works')
    await user.click(await screen.findByRole('radio', { name: '揃えて見る' }))
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: 'works', view: 'spec' }),
    )

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
    const { user } = await renderRoute('/works?tab=works')
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
    const { user } = await renderRoute('/works?tab=works&unwatched=true')
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
    const { user } = await renderRoute('/works?tab=works')
    const full = within(await screen.findByRole('article', { name: '全部そろった家' }))
    await user.click(full.getByRole('button', { name: '視聴済みにする' }))
    expect(await screen.findByText('保存できませんでした')).toBeInTheDocument()
  })

  it('pastes a video URL for a work without one, rejecting what is not a YouTube URL', async () => {
    const { user } = await renderRoute('/works?tab=works')
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
    const { user } = await renderRoute('/works?tab=works')
    const card = within(await screen.findByRole('article', { name: '手で貼った家' }))
    await user.click(card.getByRole('button', { name: '動画を変える' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: '動画を外す' }),
    )
    await waitFor(() =>
      expect(mockOf(saveWorkVideo)).toHaveBeenCalledWith({ data: { id: uid(4), url: null } }),
    )
  })

  it('plays the video from its thumbnail too', async () => {
    const { user } = await renderRoute('/works?tab=works')
    await user.click(await screen.findByRole('button', { name: '全部そろった家 の動画を見る' }))
    expect(await screen.findByTitle('全部そろった家 のルームツアー動画')).toBeInTheDocument()
  })

  it('plays the video in the app, marks it watched automatically and offers to take it back', async () => {
    const { user } = await renderRoute('/works?tab=works')
    const full = within(await screen.findByRole('article', { name: '全部そろった家' }))
    await user.click(full.getByRole('button', { name: '動画を見る（12:34）' }))

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
    const { user } = await renderRoute('/works?tab=works')
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

const CH_A = 'UCaaaaaaaaaaaaaaaaaaaaaa'
const CH_B = 'UCbbbbbbbbbbbbbbbbbbbbbb'

function clip(n: number, over: Partial<ChannelVideoRow> = {}): ChannelVideoRow {
  return {
    id: uid(100 + n),
    videoId: `video${String(n).padStart(6, '0')}`,
    channelId: CH_A,
    channel: '甲工務店',
    vendorId: 'v1',
    kind: 'video',
    title: `動画${n}`,
    durationSec: 95,
    viewCount: 12_345,
    publishedAt: '2026-09-21T16:00:00.000Z',
    sortOrder: n,
    watchedAt: null,
    ...over,
    work: over.work ?? null,
    visit: over.visit ?? null,
    memoId: over.memoId ?? null,
  }
}

const ZERO = { total: 0, watched: 0 }
const CHANNELS = [
  {
    channelId: CH_A,
    channel: '甲工務店',
    total: 40,
    watched: 1,
    kinds: { video: { total: 30, watched: 1 }, short: { total: 10, watched: 0 }, live: ZERO },
  },
  {
    channelId: CH_B,
    channel: '乙の会',
    total: 2,
    watched: 0,
    kinds: { video: { total: 2, watched: 0 }, short: ZERO, live: ZERO },
  },
]

describe('works route, videos tab', () => {
  beforeEach(() => {
    stub(listWorks, [FULL])
    stub(listChannelVideosPage, {
      rows: [
        clip(1, {
          work: {
            title: '全部そろった家',
            sourceUrl: 'https://example.com/works/p1/',
            category: '新築',
            completedOn: '2025-03',
            uaValue: 0.46,
            cValue: 0.3,
            family: '夫婦＋子ども1人',
            siteAreaTsubo: 50,
            floorAreaTsubo: 30.5,
            totalAreaTsubo: null,
            layout: '2LDK',
            points: ['薪ストーブ', '回遊できる家事動線'],
          },
          visit: { visitedOn: '2026-03-28' },
        }),
        clip(2, {
          watchedAt: '2026-10-01T00:00:00.000Z',
          kind: 'short',
          publishedAt: '2026-08-01T00:00:00.000Z',
        }),
      ],
      matched: 42,
      channels: CHANNELS,
      todayKey: '2026-09-25',
    })
    stub(markChannelVideoWatched, { ok: true })
  })

  it('opens on the videos, switches to the works and back, keeping the choice in the URL', async () => {
    const { user, router } = await renderRoute('/works')
    expect(await screen.findByRole('article', { name: '動画1' })).toBeInTheDocument()
    // Opens on the videos alone (shorts and streams were never watched)
    expect(mockOf(listChannelVideosPage)).toHaveBeenCalledWith({
      data: { kind: 'video', limit: 30 },
    })

    await user.click(screen.getByRole('radio', { name: '施工例' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: 'works' }))
    expect(await screen.findByRole('article', { name: '全部そろった家' })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '動画' }))
    expect(await screen.findByRole('article', { name: '動画1' })).toBeInTheDocument()
  })

  it('links a tour video to the page of its work', async () => {
    await renderRoute('/works')
    const first = within(await screen.findByRole('article', { name: '動画1' }))
    expect(
      first.getByRole('link', { name: '施工例「全部そろった家」を会社のページで開く' }),
    ).toHaveAttribute('href', 'https://example.com/works/p1/')
    expect(first.getByText('新築・2025/03 完成・UA値 0.46・C値 0.3')).toBeInTheDocument()
    expect(first.getByText('夫婦＋子ども1人')).toBeInTheDocument()
    expect(first.getByText('2LDK')).toBeInTheDocument()
    expect(first.getByText('薪ストーブ')).toBeInTheDocument()
    expect(first.getByText(/延床面積/)).toBeInTheDocument()
    // The house we went to: the visit date
    expect(first.getByText('2026/03/28 見学')).toBeInTheDocument()
    const second = within(screen.getByRole('article', { name: '動画2' }))
    expect(second.queryByRole('link', { name: /会社のページで開く/ })).not.toBeInTheDocument()
    expect(second.queryByText(/見学/)).not.toBeInTheDocument()
    expect(second.queryByText('間取り')).not.toBeInTheDocument()
  })

  it('shows the count per channel and kind, the watched count, and length and views per video', async () => {
    await renderRoute('/works')
    // The channel counts follow the chosen kind (videos): 30 + 2
    expect(await screen.findByRole('radio', { name: 'すべて 32' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '甲工務店 30' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '動画 32' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'ショート 10' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '全種類 42' })).toBeInTheDocument()
    expect(screen.getByText('該当 42 本・視聴済み 1/32 本')).toBeInTheDocument()
    const first = within(screen.getByRole('article', { name: '動画1' }))
    expect(first.getByText('甲工務店・動画・1:35・1.2万回・2026/09/22 公開')).toBeInTheDocument()
    // Published 3 days before today (2026-09-25 by the server)
    expect(first.getByText('New')).toBeInTheDocument()
    const second = within(screen.getByRole('article', { name: '動画2' }))
    expect(second.getByText('視聴済み')).toBeInTheDocument()
    expect(second.getByText(/ショート/)).toBeInTheDocument()
    expect(second.queryByText('New')).not.toBeInTheDocument()
  })

  it('passes the filters to the server and counts only the chosen channel', async () => {
    const { user, router } = await renderRoute('/works')
    await user.click(await screen.findByRole('radio', { name: '乙の会 2' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ch: CH_B }))
    expect(await screen.findByText('該当 42 本・視聴済み 0/2 本')).toBeInTheDocument()
    // 「すべて」 keeps counting every channel while one is selected
    expect(screen.getByRole('radio', { name: 'すべて 32' })).not.toBeChecked()

    await user.click(screen.getByRole('radio', { name: 'ライブ 0' }))
    await user.click(screen.getByRole('checkbox', { name: 'まだ見ていない' }))
    await user.type(screen.getByRole('textbox', { name: 'タイトルで検索' }), ' 平屋 ')
    await waitFor(() =>
      expect(mockOf(listChannelVideosPage)).toHaveBeenLastCalledWith({
        data: { channelId: CH_B, kind: 'live', unwatched: true, q: '平屋', limit: 30 },
      }),
    )

    // Every kind is an explicit choice in the URL; the channel counts follow it
    await user.click(screen.getByRole('radio', { name: '全種類 2' }))
    await user.click(await screen.findByRole('radio', { name: 'すべて 42' }))
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ kind: 'all', unwatched: true, q: '平屋' }),
    )
    await waitFor(() =>
      expect(mockOf(listChannelVideosPage)).toHaveBeenLastCalledWith({
        data: { unwatched: true, q: '平屋', limit: 30 },
      }),
    )
  })

  it('treats an unknown channel id as no filter', async () => {
    await renderRoute('/works?ch=UCnope')
    expect(await screen.findByRole('radio', { name: 'すべて 32' })).toBeChecked()
  })

  it('shows 30 more with the "show more" button', async () => {
    const { user, router } = await renderRoute('/works')
    await user.click(await screen.findByRole('button', { name: 'もっと見る（残り 40 本）' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ n: 60 }))
    await waitFor(() =>
      expect(mockOf(listChannelVideosPage)).toHaveBeenLastCalledWith({
        data: { kind: 'video', limit: 60 },
      }),
    )
  })

  it('offers to write a memo from a video, and to open the memo once there is one', async () => {
    stub(listChannelVideosPage, {
      rows: [clip(1), clip(2, { memoId: uid(7) })],
      matched: 2,
      channels: CHANNELS,
      todayKey: '2026-09-25',
    })
    await renderRoute('/works')
    const first = within(await screen.findByRole('article', { name: '動画1' }))
    expect(first.getByRole('link', { name: 'メモを書く' })).toHaveAttribute(
      'href',
      '/records?tab=videos&video=video000001',
    )
    const second = within(screen.getByRole('article', { name: '動画2' }))
    expect(second.getByRole('link', { name: 'メモを見る' })).toHaveAttribute(
      'href',
      `/records/videos/${uid(7)}`,
    )
  })

  it('marks a video watched with an undo, and takes a watched one back', async () => {
    const { user } = await renderRoute('/works')
    const first = within(await screen.findByRole('article', { name: '動画1' }))
    await user.click(first.getByRole('button', { name: '視聴済みにする' }))
    await waitFor(() =>
      expect(mockOf(markChannelVideoWatched)).toHaveBeenCalledWith({
        data: { id: uid(101), watched: true },
      }),
    )
    await user.click(await screen.findByRole('button', { name: '取り消す' }))
    await waitFor(() =>
      expect(mockOf(markChannelVideoWatched)).toHaveBeenCalledWith({
        data: { id: uid(101), watched: false },
      }),
    )

    const second = within(screen.getByRole('article', { name: '動画2' }))
    await user.click(second.getByRole('button', { name: '視聴済みを取り消す' }))
    await waitFor(() =>
      expect(mockOf(markChannelVideoWatched)).toHaveBeenCalledWith({
        data: { id: uid(102), watched: false },
      }),
    )
  })

  it('says so when saving fails', async () => {
    mockOf(markChannelVideoWatched).mockRejectedValue(new Error('boom'))
    const { user } = await renderRoute('/works')
    const first = within(await screen.findByRole('article', { name: '動画1' }))
    await user.click(first.getByRole('button', { name: '視聴済みにする' }))
    expect(await screen.findByText('保存できませんでした')).toBeInTheDocument()
  })

  it('plays a video in the app and marks it watched at the end', async () => {
    const { user } = await renderRoute('/works')
    await user.click(await screen.findByRole('button', { name: '動画1 を見る' }))
    const frame = (await screen.findByTitle('動画1 のルームツアー動画')) as HTMLIFrameElement
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://www.youtube-nocookie.com',
        source: frame.contentWindow,
        data: JSON.stringify({ event: 'onStateChange', info: 0 }),
      }),
    )
    await waitFor(() =>
      expect(mockOf(markChannelVideoWatched)).toHaveBeenCalledWith({
        data: { id: uid(101), watched: true },
      }),
    )
  })

  it('says when nothing matches, and when nothing has been imported', async () => {
    stub(listChannelVideosPage, {
      rows: [],
      matched: 0,
      channels: CHANNELS,
      todayKey: '2026-09-25',
    })
    await renderRoute('/works?q=nothing')
    expect(await screen.findByText('条件に合う動画がありません')).toBeInTheDocument()
  })

  it('shows the empty state before the first import', async () => {
    stub(listChannelVideosPage, { rows: [], matched: 0, channels: [] })
    await renderRoute('/works')
    expect(await screen.findByText('動画がまだありません')).toBeInTheDocument()
  })
})
