import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { listCommentsFor } from '../server/comments'
import { deleteVideo, getVideo, saveVideo, videoFormOptions } from '../server/videos'
import { MEMBERS, mockOf, stub, uid, video } from '../../test/ui/fixtures'
import { flushPendingDeletes, renderRoute } from '../../test/ui/render'

const ID = uid(41)
const PAGE = `/records/videos/${ID}`

describe('video detail route', () => {
  beforeEach(() => {
    stub(getVideo, {
      video: video({
        id: ID,
        thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
        vendorId: 'v1',
      }),
      vendor: { id: 'v1', name: 'テスト工務店' },
    })
    stub(videoFormOptions, { tags: ['断熱'], vendors: [{ id: 'v1', name: 'テスト工務店' }] })
    stub(listCommentsFor, { comments: [], me: 'owner@example.com', members: MEMBERS })
  })

  it('shows the memo with its link to YouTube', async () => {
    await renderRoute(PAGE)
    expect(
      await screen.findByRole('heading', { level: 1, name: '断熱の基本を解説' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'YouTube で開く' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=abcdefghijk',
    )
    expect(screen.getByText('テストチャンネル')).toBeInTheDocument()
    expect(screen.getByText('2026/09/15')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'テスト工務店' })).toHaveAttribute(
      'href',
      '/candidates/vendors/v1',
    )
    expect(screen.getByRole('heading', { name: '学び' })).toBeInTheDocument()
    expect(screen.getByText('UA値は0.46以下を目安にする')).toBeInTheDocument()
  })

  it('leaves out the empty parts', async () => {
    stub(getVideo, {
      video: video({ id: ID, channel: null, watchedOn: null, tags: [], takeaways: ' ' }),
      vendor: null,
    })
    await renderRoute(PAGE)
    await screen.findByRole('heading', { level: 1, name: '断熱の基本を解説' })
    expect(screen.queryByRole('heading', { name: '学び' })).not.toBeInTheDocument()
    expect(document.querySelector('main .mantine-Card-root')).toBeNull()
  })

  it('edits the memo, and cancel closes the form', async () => {
    const save = stub(saveVideo, { id: ID })
    const { user } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: '編集' }))
    let drawer = await screen.findByRole('dialog', { name: '動画メモを編集' })
    await user.click(within(drawer).getByRole('button', { name: 'キャンセル' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '編集' }))
    drawer = await screen.findByRole('dialog', { name: '動画メモを編集' })
    expect(
      within(drawer).queryByRole('button', { name: '保存して続けて追加' }),
    ).not.toBeInTheDocument()
    await user.type(within(drawer).getByRole('textbox', { name: '学び' }), '。窓が大事')
    await user.click(within(drawer).getByRole('button', { name: '動画メモを保存' }))
    expect(await screen.findByText('更新しました')).toBeInTheDocument()
    expect(save).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: ID, takeaways: 'UA値は0.46以下を目安にする。窓が大事' }),
    })
  })

  it('reports the server reason next to the field', async () => {
    mockOf(saveVideo).mockRejectedValue(new Error('題名が長すぎます'))
    const { user } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: '編集' }))
    const drawer = await screen.findByRole('dialog', { name: '動画メモを編集' })
    await user.click(within(drawer).getByRole('button', { name: '動画メモを保存' }))
    expect(await screen.findByText('題名が長すぎます')).toBeInTheDocument()
  })

  it('deletes the memo and returns to the video list', async () => {
    const remove = stub(deleteVideo, { ok: true })
    const { user, router } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: 'この動画メモを削除' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'videos' }))
    flushPendingDeletes()
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(expect.objectContaining({ data: { id: ID } })),
    )
  })

  it('shows the in-app 404 for a malformed id', async () => {
    await renderRoute('/records/videos/zzz')
    expect(await screen.findByText('見つかりません')).toBeInTheDocument()
  })
})
