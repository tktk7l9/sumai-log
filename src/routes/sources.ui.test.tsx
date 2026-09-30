import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  deleteSource,
  listSources,
  resolveSource,
  saveSource,
  sourceFormOptions,
} from '../server/sources'
import { mockOf, source, stub } from '../../test/ui/fixtures'
import { flushPendingDeletes, renderRoute } from '../../test/ui/render'

function row(over: Parameters<typeof source>[0], vendorName: string | null = null) {
  return { ...source(over), vendorName }
}

describe('sources route', () => {
  beforeEach(() => {
    stub(listSources, [
      row({
        id: 's1',
        name: 'テスト住宅チャンネル',
        description: '断熱の話が多い',
        affiliation: 'iedukuri100',
      }),
      row(
        { id: 's2', name: 'テスト工務店公式', genre: 'candidates', vendorId: 'v1' },
        'テスト工務店',
      ),
    ])
    stub(sourceFormOptions, { vendors: [{ id: 'v1', name: 'テスト工務店' }] })
  })

  it('groups sources by genre with their badges', async () => {
    await renderRoute('/sources')
    expect(await screen.findByRole('heading', { name: '候補の会社（1）' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '家づくりの知識（1）' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'テスト住宅チャンネル' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/@test-house',
    )
    expect(screen.getByText('断熱の話が多い')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '候補「テスト工務店」を見る' })).toHaveAttribute(
      'href',
      '/candidates/vendors/v1',
    )
    expect(screen.getByRole('link', { name: '用語集で 家づくり百貨 を見る' })).toBeInTheDocument()
  })

  it('filters by genre and back to all', async () => {
    const { user, router } = await renderRoute('/sources')
    await user.click(await screen.findByRole('radio', { name: '候補の会社' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ g: 'candidates' }))
    expect(screen.queryByText('テスト住宅チャンネル')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'お金・ローン' }))
    expect(await screen.findByText('情報源がありません')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'すべて' }))
    await waitFor(() => expect(router.state.location.search).toEqual({}))
  })

  it('fills a new source from its channel page and saves it', async () => {
    stub(resolveSource, {
      ok: true,
      fields: {
        name: '取得したチャンネル',
        description: '説明文',
        avatarUrl: null,
        handle: '@fetched',
        channelId: 'UC123',
      },
    })
    const save = stub(saveSource, { id: 's3' })
    const { user } = await renderRoute('/sources')
    await user.click(await screen.findByRole('button', { name: '情報源を追加' }))
    const drawer = await screen.findByRole('dialog', { name: '情報源を追加' })
    await user.click(within(drawer).getByRole('button', { name: '取得' }))
    expect(await within(drawer).findByText('URL は必須です')).toBeInTheDocument()

    await user.type(
      within(drawer).getByRole('textbox', { name: 'URL' }),
      'https://www.youtube.com/@fetched',
    )
    await user.click(within(drawer).getByRole('button', { name: '取得' }))
    expect(await screen.findByText('取得しました')).toBeInTheDocument()
    expect(within(drawer).getByRole('textbox', { name: '名前' })).toHaveValue('取得したチャンネル')
    expect(within(drawer).getByText('@fetched')).toBeInTheDocument()

    await user.click(within(drawer).getByRole('button', { name: '情報源を保存' }))
    expect(await screen.findByText('情報源を追加しました')).toBeInTheDocument()
    expect(save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        url: 'https://www.youtube.com/@fetched',
        name: '取得したチャンネル',
        channelId: 'UC123',
      }),
    })
  })

  it('reports what the fetch could not do', async () => {
    const { user } = await renderRoute('/sources')
    await user.click(await screen.findByRole('button', { name: '情報源を追加' }))
    const drawer = await screen.findByRole('dialog', { name: '情報源を追加' })
    await user.type(within(drawer).getByRole('textbox', { name: 'URL' }), 'https://example.com/')

    stub(resolveSource, { ok: false, error: 'YouTube のチャンネル URL だけ取得できます' })
    await user.click(within(drawer).getByRole('button', { name: '取得' }))
    expect(await screen.findByText('YouTube のチャンネル URL だけ取得できます')).toBeInTheDocument()

    stub(resolveSource, {
      ok: true,
      fields: { name: null, description: null, avatarUrl: null, handle: null, channelId: null },
    })
    await user.click(within(drawer).getByRole('button', { name: '取得' }))
    expect(
      await screen.findByText(/このページからは情報を取得できませんでした/),
    ).toBeInTheDocument()

    mockOf(resolveSource).mockRejectedValue(new Error('通信に失敗しました'))
    await user.click(within(drawer).getByRole('button', { name: '取得' }))
    expect(await screen.findByText('通信に失敗しました')).toBeInTheDocument()
  })

  it('marks a duplicate URL on the field', async () => {
    mockOf(saveSource).mockRejectedValue(new Error('この URL は登録済みです'))
    const { user } = await renderRoute('/sources')
    await user.click(await screen.findByRole('button', { name: 'テスト住宅チャンネル の操作' }))
    await user.click(await screen.findByRole('menuitem', { name: '編集' }))
    const drawer = await screen.findByRole('dialog', { name: '情報源を編集' })
    expect(within(drawer).getByRole('textbox', { name: '名前' })).toHaveValue(
      'テスト住宅チャンネル',
    )
    await user.click(within(drawer).getByRole('button', { name: '情報源を保存' }))
    await waitFor(() =>
      expect(within(drawer).getAllByText('この URL は登録済みです').length).toBeGreaterThan(0),
    )
    expect(within(drawer).getByRole('textbox', { name: 'URL' })).toBeInvalid()
    await user.click(within(drawer).getByRole('button', { name: 'キャンセル' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('deletes a source with undo', async () => {
    const remove = stub(deleteSource, { ok: true })
    const { user } = await renderRoute('/sources')
    await user.click(await screen.findByRole('button', { name: 'テスト工務店公式 の操作' }))
    await user.click(await screen.findByRole('menuitem', { name: '削除' }))
    expect(await screen.findByText('「テスト工務店公式」を削除しました')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: '候補の会社（1）' })).not.toBeInTheDocument(),
    )
    flushPendingDeletes()
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(expect.objectContaining({ data: { id: 's2' } })),
    )
  })
})
