import { screen, waitFor, within } from '@testing-library/react'
import dayjs from 'dayjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getChannelVideoForMemo } from '../../server/channelVideos'
import { addVideoFromLink, listVideos, undoAddedVideo, videoFormOptions } from '../../server/videos'
import { listVisits, visitFormOptions } from '../../server/visits'
import { mockOf, stub, uid, video } from '../../../test/ui/fixtures'
import { renderRoute } from '../../../test/ui/render'

const ID = 'dQw4w9WgXcQ'
const SHARE_LINK = `https://youtu.be/${ID}?si=abcDEF123`
const SAVED = { status: 'saved', id: uid(7), title: '平屋のルームツアー', markedWatched: true }
const ADD = 'コピーしたリンクから動画を追加'

/** The videos tab of /records, where the button sits above the list */
async function openVideosTab() {
  const utils = await renderRoute('/records?tab=videos')
  await screen.findByRole('button', { name: ADD })
  return utils
}

/** What the YouTube app's 「リンクをコピー」 leaves behind (user-event stubs the clipboard) */
async function copy(text: string) {
  await navigator.clipboard.writeText(text)
}

describe('adding a video from a copied link', () => {
  beforeEach(() => {
    stub(listVisits, [])
    stub(listVideos, [{ ...video(), vendorName: null }])
    stub(visitFormOptions, { targets: { vendors: [], properties: [] }, places: [], events: [] })
    stub(videoFormOptions, { tags: [], vendors: [] })
    stub(getChannelVideoForMemo, { video: null })
    stub(undoAddedVideo, { ok: true })
  })

  it('saves the copied link with one press, with today as the day watched, and says what was saved', async () => {
    stub(addVideoFromLink, SAVED)
    const { user } = await openVideosTab()
    await copy(SHARE_LINK)
    const loads = mockOf(listVideos).mock.calls.length

    await user.click(screen.getByRole('button', { name: ADD }))

    expect(await screen.findByText('保存しました：平屋のルームツアー')).toBeInTheDocument()
    expect(mockOf(addVideoFromLink)).toHaveBeenCalledWith({
      data: { url: SHARE_LINK, watchedOn: dayjs().format('YYYY-MM-DD') },
    })
    // The list behind the notification shows the new memo
    expect(mockOf(listVideos).mock.calls.length).toBeGreaterThan(loads)
  })

  it('finds the link inside a title and a sentence that were copied with it', async () => {
    stub(addVideoFromLink, SAVED)
    const { user } = await openVideosTab()
    await copy(`平屋のルームツアー\n${SHARE_LINK} を観た`)

    await user.click(screen.getByRole('button', { name: ADD }))

    await screen.findByText('保存しました：平屋のルームツアー')
    expect(mockOf(addVideoFromLink).mock.calls[0]?.[0]).toMatchObject({ data: { url: SHARE_LINK } })
  })

  it('takes the save back with 「取り消す」, together with the watched mark it set', async () => {
    stub(addVideoFromLink, SAVED)
    const { user } = await openVideosTab()
    await copy(SHARE_LINK)
    await user.click(screen.getByRole('button', { name: ADD }))
    await screen.findByText('保存しました：平屋のルームツアー')

    await user.click(screen.getByRole('button', { name: '取り消す' }))

    expect(await screen.findByText('取り消しました')).toBeInTheDocument()
    expect(mockOf(undoAddedVideo)).toHaveBeenCalledWith({
      data: { id: SAVED.id, unmarkWatched: true },
    })
    expect(screen.queryByText('保存しました：平屋のルームツアー')).not.toBeInTheDocument()
  })

  it('says so when the save could not be taken back', async () => {
    stub(addVideoFromLink, SAVED)
    mockOf(undoAddedVideo).mockRejectedValue(new Error('offline'))
    const { user } = await openVideosTab()
    await copy(SHARE_LINK)
    await user.click(screen.getByRole('button', { name: ADD }))
    await screen.findByText('保存しました：平屋のルームツアー')

    await user.click(screen.getByRole('button', { name: '取り消す' }))

    expect(await screen.findByText('取り消せませんでした')).toBeInTheDocument()
    // The memo is still there, so it can be opened or taken back again
    expect(screen.getByText('保存しました：平屋のルームツアー')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取り消す' })).toBeEnabled()
  })

  it('opens the saved memo from there, where tags and notes can be added', async () => {
    stub(addVideoFromLink, SAVED)
    const { user, router } = await openVideosTab()
    await copy(SHARE_LINK)
    await user.click(screen.getByRole('button', { name: ADD }))
    await screen.findByText('保存しました：平屋のルームツアー')

    await user.click(
      within(screen.getByRole('status', { name: '動画の追加の結果' })).getByRole('button', {
        name: '開く',
      }),
    )

    await waitFor(() => expect(router.state.location.pathname).toBe(`/records/videos/${SAVED.id}`))
  })

  it('does not save a video twice: it points at the memo that is there', async () => {
    stub(addVideoFromLink, { status: 'exists', id: uid(8), title: '前に観た動画' })
    const { user, router } = await openVideosTab()
    await copy(SHARE_LINK)

    await user.click(screen.getByRole('button', { name: ADD }))

    expect(await screen.findByText('すでに記録してあります：前に観た動画')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取り消す' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '開く' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/records/videos/${uid(8)}`))
  })

  it('says what to do when the clipboard holds no YouTube link, and saves nothing', async () => {
    const { user } = await openVideosTab()
    await copy('買い物メモ 牛乳')

    await user.click(screen.getByRole('button', { name: ADD }))

    expect(
      await screen.findByText(
        'コピーした内容に YouTube のリンクがありません。YouTube の「共有」→「コピー」のあとで、もう一度押してください',
      ),
    ).toBeInTheDocument()
    expect(mockOf(addVideoFromLink)).not.toHaveBeenCalled()
  })

  it('offers a field to paste into when the clipboard cannot be read, and saves on paste', async () => {
    stub(addVideoFromLink, SAVED)
    const { user } = await openVideosTab()
    vi.spyOn(navigator.clipboard, 'readText').mockRejectedValue(
      new DOMException('denied', 'NotAllowedError'),
    )

    await user.click(screen.getByRole('button', { name: ADD }))

    const field = await screen.findByRole('textbox', { name: 'YouTube のリンク' })
    await waitFor(() => expect(field).toHaveFocus())
    expect(mockOf(addVideoFromLink)).not.toHaveBeenCalled()

    await user.paste(SHARE_LINK)

    expect(await screen.findByText('保存しました：平屋のルームツアー')).toBeInTheDocument()
    expect(mockOf(addVideoFromLink).mock.calls[0]?.[0]).toMatchObject({ data: { url: SHARE_LINK } })
    // Ready for the next link
    await waitFor(() => expect(field).toHaveValue(''))
  })

  it('offers the same field in a browser without clipboard reading, and saves a typed link with 「追加」', async () => {
    stub(addVideoFromLink, SAVED)
    const { user } = await openVideosTab()
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })

    await user.click(screen.getByRole('button', { name: ADD }))
    const field = await screen.findByRole('textbox', { name: 'YouTube のリンク' })

    // Not a link: the field says so and nothing is sent
    await user.type(field, 'あとで観る')
    await user.click(screen.getByRole('button', { name: '追加' }))
    expect(await screen.findByText('YouTube のリンクを入れてください')).toBeInTheDocument()
    expect(mockOf(addVideoFromLink)).not.toHaveBeenCalled()

    await user.clear(field)
    await user.type(field, `https://www.youtube.com/watch?v=${ID}{Enter}`)

    expect(await screen.findByText('保存しました：平屋のルームツアー')).toBeInTheDocument()
    expect(screen.queryByText('YouTube のリンクを入れてください')).not.toBeInTheDocument()
  })

  it('hands over to the memo form, with the link filled in, when the title cannot be read', async () => {
    stub(addVideoFromLink, { status: 'untitled', videoId: ID })
    const { user } = await openVideosTab()
    await copy(SHARE_LINK)

    await user.click(screen.getByRole('button', { name: ADD }))

    expect(
      await screen.findByText('題名を取得できませんでした。題名を入れて保存してください'),
    ).toBeInTheDocument()
    const form = await screen.findByRole('dialog', { name: '動画メモを書く' })
    expect(within(form).getByRole('textbox', { name: 'URL' })).toHaveValue(
      `https://www.youtube.com/watch?v=${ID}`,
    )
  })

  it('says what happened under the button, not in a notification that would cover it', async () => {
    stub(addVideoFromLink, SAVED)
    const { user } = await openVideosTab()
    await copy(SHARE_LINK)

    await user.click(screen.getByRole('button', { name: ADD }))

    const said = await screen.findByText('保存しました：平屋のルームツアー')
    expect(screen.getByRole('status', { name: '動画の追加の結果' })).toContainElement(said)
    expect(said.closest('[role="alert"]')).toBeNull()
    // Ready for the next video right away
    expect(screen.getByRole('button', { name: ADD })).toBeEnabled()
  })

  it('says so when saving failed, and can be pressed again', async () => {
    mockOf(addVideoFromLink).mockRejectedValueOnce(new Error('offline'))
    const { user } = await openVideosTab()
    await copy(SHARE_LINK)

    await user.click(screen.getByRole('button', { name: ADD }))

    expect(await screen.findByText('保存できませんでした')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: ADD })).toBeEnabled())
  })

  it('is on the videos tab before the first memo too', async () => {
    stub(listVideos, [])
    await openVideosTab()
    expect(screen.getByText('観た動画のメモを残しましょう')).toBeInTheDocument()
  })
})
