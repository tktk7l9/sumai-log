import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listCommentsFor } from '../server/comments'
import {
  deletePhoto,
  deleteVisit,
  getVisit,
  reorderPhotos,
  saveVisit,
  saveVisitNextActions,
  visitFormOptions,
} from '../server/visits'
import {
  MEMBERS,
  event,
  mockOf,
  photo,
  place,
  property,
  stub,
  uid,
  vendor,
  visit,
} from '../../test/ui/fixtures'
import { flushPendingDeletes, renderRoute } from '../../test/ui/render'

const ID = uid(31)
const PAGE = `/records/visits/${ID}`

/** Touch coordinates as both lists carry them (react-remove-scroll reads changedTouches too) */
function touchAt(clientX: number) {
  const touch = [{ clientX, clientY: 0 }]
  return { touches: touch, changedTouches: touch }
}

const PHOTOS = [
  photo({ id: 'ph1', caption: '玄関' }),
  photo({
    id: 'ph2',
    displayKey: 'photos/vi1/ph2-display.jpg',
    thumbKey: 'photos/vi1/ph2-thumb.jpg',
  }),
  photo({
    id: 'ph3',
    displayKey: 'photos/vi1/ph3-display.jpg',
    thumbKey: 'photos/vi1/ph3-thumb.jpg',
  }),
]

function detail(over: Record<string, unknown> = {}) {
  return {
    visit: visit({
      id: ID,
      qa: 'Q: 工期は？\nA: 4か月',
      nextActions: '見積もりを依頼\n済 資料を読む',
    }),
    place: place({ id: 'pl1', name: 'テスト展示場' }),
    vendor: vendor({ id: 'v1', name: 'テスト工務店' }),
    property: property({ id: 'p1', name: 'テストレジデンス' }),
    event: event({ id: 'e1', title: '構造見学会' }),
    photos: PHOTOS,
    ...over,
  }
}

describe('visit detail route', () => {
  beforeEach(() => {
    stub(getVisit, detail())
    stub(visitFormOptions, {
      targets: {
        vendors: [{ id: 'v1', name: 'テスト工務店' }],
        properties: [{ id: 'p1', name: 'テストレジデンス' }],
      },
      places: [],
      events: [],
    })
    stub(listCommentsFor, { comments: [], me: 'owner@example.com', members: MEMBERS })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows what was linked, the notes, next actions and photos', async () => {
    await renderRoute(PAGE)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'テスト展示場' }),
    ).toBeInTheDocument()
    expect(screen.getByText('2026/09/20（日）')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'テスト工務店' })).toHaveAttribute(
      'href',
      '/candidates/vendors/v1',
    )
    expect(screen.getByRole('link', { name: 'テストレジデンス' })).toHaveAttribute(
      'href',
      '/candidates/properties/p1',
    )
    expect(screen.getByText('構造見学会')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '聞いたことと答え' })).toBeInTheDocument()
    expect(screen.getByText('残り 1 / 2')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '資料を読む' })).toBeChecked()
    expect(screen.getAllByRole('button', { name: '写真を大きく表示' })).toHaveLength(3)
  })

  it('leaves out empty notes and the link card when nothing is linked', async () => {
    stub(
      getVisit,
      detail({
        visit: visit({ id: ID, good: null, concerns: '  ', nextActions: null }),
        place: null,
        vendor: null,
        property: null,
        event: null,
        photos: [],
      }),
    )
    await renderRoute(PAGE)
    expect(await screen.findByRole('heading', { level: 1, name: '場所未設定' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '良かった点' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '気になった点' })).not.toBeInTheDocument()
    expect(screen.queryByText('場所')).not.toBeInTheDocument()
    expect(document.querySelector('main .mantine-Card-root')).toBeNull()
    expect(
      screen.getByText(/まだありません。下の欄に入れて Enter で足せます。/),
    ).toBeInTheDocument()
    expect(screen.getByText('写真はまだありません。')).toBeInTheDocument()
  })

  it('ticks and adds next actions, saving each on the spot', async () => {
    const save = stub(saveVisitNextActions, { updatedAt: '2026-09-21 00:00:00' })
    const { user } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('checkbox', { name: '見積もりを依頼' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        data: {
          id: ID,
          nextActions: '済 見積もりを依頼\n済 資料を読む',
          expectedUpdatedAt: '2026-09-01 00:00:00',
        },
      }),
    )
    const box = screen.getByPlaceholderText('やることを足す（Enter で追加）')
    expect(screen.getByRole('button', { name: 'やることを追加' })).toBeDisabled()
    await user.type(box, '土地の測量{Enter}')
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith({
        data: {
          id: ID,
          nextActions: '済 見積もりを依頼\n済 資料を読む\n土地の測量',
          expectedUpdatedAt: '2026-09-21 00:00:00',
        },
      }),
    )
    expect(box).toHaveValue('')
  })

  it('reloads instead of overwriting when the partner changed the actions first', async () => {
    stub(saveVisitNextActions, { conflict: true })
    const { user } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('checkbox', { name: '見積もりを依頼' }))
    expect(await screen.findByText(/最新の内容を読み直しました/)).toBeInTheDocument()
  })

  it('tells when a next action could not be saved', async () => {
    mockOf(saveVisitNextActions).mockRejectedValue(new Error('offline'))
    const { user } = await renderRoute(PAGE)
    await user.type(
      await screen.findByPlaceholderText('やることを足す（Enter で追加）'),
      '電話する',
    )
    await user.click(screen.getByRole('button', { name: 'やることを追加' }))
    expect(await screen.findByText('保存できませんでした')).toBeInTheDocument()
  })

  it('browses photos full screen with buttons, keys and swipes, and deletes one', async () => {
    const remove = stub(deletePhoto, { ok: true })
    const { user } = await renderRoute(PAGE)
    await user.click((await screen.findAllByRole('button', { name: '写真を大きく表示' }))[0]!)
    expect(await screen.findByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByText('玄関')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '次の写真' }))
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '前の写真' }))
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByText('2 / 3')).toBeInTheDocument()

    const viewer = screen.getByText('2 / 3').closest('.mantine-Stack-root')!.parentElement!
    fireEvent.touchStart(viewer, touchAt(200))
    fireEvent.touchEnd(viewer, touchAt(100))
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    fireEvent.touchStart(viewer, touchAt(100))
    fireEvent.touchEnd(viewer, touchAt(110))
    expect(screen.getByText('3 / 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'この写真を削除' }))
    expect(await screen.findByText('写真を削除しました')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '写真を大きく表示' })).toHaveLength(2),
    )
    flushPendingDeletes()
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(expect.objectContaining({ data: { id: 'ph3' } })),
    )
  })

  it('closes the photo viewer', async () => {
    const { user } = await renderRoute(PAGE)
    await user.click((await screen.findAllByRole('button', { name: '写真を大きく表示' }))[1]!)
    await user.click(await screen.findByRole('button', { name: '閉じる' }))
    await waitFor(() => expect(screen.queryByText('2 / 3')).not.toBeInTheDocument())
  })

  it('reorders photos and reports a refused save', async () => {
    const reorder = stub(reorderPhotos, { ok: true })
    const { user } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: '並び替え' }))
    expect(screen.getAllByRole('button', { name: '前へ' })[0]).toBeDisabled()
    await user.click(screen.getAllByRole('button', { name: '後ろへ' })[0]!)
    await user.click(screen.getAllByRole('button', { name: '前へ' })[2]!)
    await user.click(screen.getByRole('button', { name: '完了' }))
    await waitFor(() =>
      expect(reorder).toHaveBeenCalledWith({
        data: { visitId: ID, photoIds: ['ph2', 'ph3', 'ph1'] },
      }),
    )
    expect(await screen.findByRole('button', { name: '並び替え' })).toBeInTheDocument()

    stub(reorderPhotos, { ok: false })
    await user.click(screen.getByRole('button', { name: '並び替え' }))
    await user.click(screen.getByRole('button', { name: '完了' }))
    expect(await screen.findByText('並び替えを保存できませんでした')).toBeInTheDocument()
  })

  it('uploads photos downscaled on the device and reports failures', async () => {
    const bitmap = { width: 3200, height: 2400, close: vi.fn() }
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) {
      cb(new Blob(['jpeg'], { type: 'image/jpeg' }))
    })
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: '容量オーバー' }), { status: 413 }),
      )
    const { user } = await renderRoute(PAGE)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
    ])
    expect(
      await screen.findByText('1 枚を追加、1 枚は失敗しました（容量オーバー）'),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/photos',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = fetchMock.mock.calls[0]![1]!.body as FormData
    expect(body.get('width')).toBe('1600')
    expect(body.get('height')).toBe('1200')
    expect(bitmap.close).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })

  it('edits the record', async () => {
    const save = stub(saveVisit, { id: ID })
    const { user } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: '編集' }))
    const drawer = await screen.findByRole('dialog', { name: '見学記録を編集' })
    const concerns = within(drawer).getByRole('textbox', { name: '気になった点' })
    await user.clear(concerns)
    await user.click(within(drawer).getByRole('button', { name: '記録を保存' }))
    expect(await screen.findByText('記録を更新しました')).toBeInTheDocument()
    expect(save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: ID,
        concerns: null,
        expectedUpdatedAt: '2026-09-01 00:00:00',
      }),
    })
  })

  it('deletes the record and returns to the list', async () => {
    const remove = stub(deleteVisit, { ok: true })
    const { user, router } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: 'この見学記録を削除' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/records'))
    await act(async () => flushPendingDeletes())
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(expect.objectContaining({ data: { id: ID } })),
    )
  })
})
