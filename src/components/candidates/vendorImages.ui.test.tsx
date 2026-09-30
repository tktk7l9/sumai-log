import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getVendor } from '../../server/candidates'
import { listCommentsFor } from '../../server/comments'
import { listLinkTargets } from '../../server/places'
import { getBuildPlan } from '../../server/research'
import { getHomeAreas } from '../../server/settings'
import {
  deleteRepresentativePhoto,
  deleteVendorFavicon,
  importRepresentativePhotoFromUrl,
} from '../../server/vendorImages'
import { MEMBERS, mockOf, stub, uid, vendor } from '../../../test/ui/fixtures'
import { renderRoute } from '../../../test/ui/render'

const V = uid(81)

async function openEditForm(
  v = vendor({
    id: V,
    representativePhotoKey: 'vendors/x/representative-1.jpg',
    faviconKey: 'vendors/x/favicon-1.png',
  }),
) {
  stub(getVendor, { vendor: v, places: [], coversHome: false })
  const utils = await renderRoute(`/candidates/vendors/${V}`)
  await utils.user.click((await screen.findAllByRole('button', { name: '編集' }))[0]!)
  const drawer = await screen.findByRole('dialog', { name: '業者を編集' })
  return { ...utils, drawer }
}

/** The two hidden file inputs of the form: [representative photo, site icon] */
function fileInputs(drawer: HTMLElement) {
  return drawer.querySelectorAll<HTMLInputElement>('input[type="file"]')
}

describe('vendor images in the vendor form', () => {
  beforeEach(() => {
    stub(getHomeAreas, [])
    stub(listLinkTargets, { vendors: [], properties: [] })
    stub(listCommentsFor, { comments: [], me: 'owner@example.com', members: MEMBERS })
    stub(getBuildPlan, { plan: null })
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1200, height: 1600, close: vi.fn() })),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) {
      cb(new Blob(['jpeg'], { type: 'image/jpeg' }))
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uploads a representative photo downscaled on the device', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    const { user, drawer } = await openEditForm()
    await user.upload(fileInputs(drawer)[0]!, new File(['x'], 'face.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByText('代表者の写真を更新しました')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/vendor-photos/${V}`,
      expect.objectContaining({ method: 'POST' }),
    )
    const body = fetchMock.mock.calls[0]![1]!.body as FormData
    expect(body.get('width')).toBe('600')
    expect(body.get('height')).toBe('800')
  })

  it('reports a refused representative photo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json', { status: 500 }))
    const { user, drawer } = await openEditForm()
    await user.upload(fileInputs(drawer)[0]!, new File(['x'], 'face.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByText('HTTP 500')).toBeInTheDocument()
  })

  it('imports a representative photo from a URL', async () => {
    const importer = stub(importRepresentativePhotoFromUrl, { ok: true })
    const { user, drawer } = await openEditForm()
    const button = within(drawer).getByRole('button', { name: '取り込む' })
    expect(button).toBeDisabled()
    await user.type(
      within(drawer).getByRole('textbox', { name: 'URL から取り込む' }),
      ' https://example.com/p.jpg ',
    )
    await user.click(button)
    expect(await screen.findByText('代表者の写真を取り込みました')).toBeInTheDocument()
    expect(importer).toHaveBeenCalledWith({
      data: { vendorId: V, url: 'https://example.com/p.jpg' },
    })
    expect(within(drawer).getByRole('textbox', { name: 'URL から取り込む' })).toHaveValue('')

    stub(importRepresentativePhotoFromUrl, { ok: false, error: '画像ではありません' })
    await user.type(
      within(drawer).getByRole('textbox', { name: 'URL から取り込む' }),
      'https://example.com/a',
    )
    await user.click(button)
    expect(await screen.findByText('画像ではありません')).toBeInTheDocument()

    mockOf(importRepresentativePhotoFromUrl).mockRejectedValue(new Error('取り込めませんでした'))
    await user.click(button)
    expect(await screen.findByText('取り込めませんでした')).toBeInTheDocument()
  })

  it('deletes the representative photo, or says why it could not', async () => {
    stub(deleteRepresentativePhoto, { ok: true })
    const { user, drawer } = await openEditForm()
    await user.click(within(drawer).getAllByRole('button', { name: '削除' })[0]!)
    expect(await screen.findByText('代表者の写真を削除しました')).toBeInTheDocument()

    stub(deleteRepresentativePhoto, { ok: false, error: '写真がありません' })
    await user.click(within(drawer).getAllByRole('button', { name: '削除' })[0]!)
    expect(await screen.findByText('写真がありません')).toBeInTheDocument()

    mockOf(deleteRepresentativePhoto).mockRejectedValue(new Error('通信に失敗しました'))
    await user.click(within(drawer).getAllByRole('button', { name: '削除' })[0]!)
    expect(await screen.findByText('通信に失敗しました')).toBeInTheDocument()
  })

  it('uploads a site icon as it is, and reports failures', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: '512 KB を超えています' }), { status: 413 }),
      )
    const { user, drawer } = await openEditForm()
    const icon = new File(['ico'], 'favicon.ico', { type: 'image/x-icon' })
    await user.upload(fileInputs(drawer)[1]!, icon)
    expect(await screen.findByText('サイトのアイコンを更新しました')).toBeInTheDocument()
    expect((fetchMock.mock.calls[0]![1]!.body as FormData).get('file')).toBeInstanceOf(File)
    await user.upload(fileInputs(drawer)[1]!, new File(['big'], 'big.png', { type: 'image/png' }))
    expect(await screen.findByText('512 KB を超えています')).toBeInTheDocument()
  })

  it('says why a site icon could not be deleted', async () => {
    stub(deleteVendorFavicon, { ok: false, error: 'アイコンがありません' })
    const { user, drawer } = await openEditForm()
    await user.click(within(drawer).getAllByRole('button', { name: '削除' })[1]!)
    expect(await screen.findByText('アイコンがありません')).toBeInTheDocument()
    mockOf(deleteVendorFavicon).mockRejectedValue(new Error('通信に失敗しました'))
    await user.click(within(drawer).getAllByRole('button', { name: '削除' })[1]!)
    expect(await screen.findByText('通信に失敗しました')).toBeInTheDocument()
  })

  it('offers photo operations only after the first save', async () => {
    const { drawer } = await openEditForm(vendor({ id: V }))
    // A saved vendor without images offers to add them but nothing to delete
    expect(within(drawer).queryAllByRole('button', { name: '削除' })).toHaveLength(0)
    await waitFor(() =>
      expect(within(drawer).getByRole('button', { name: '写真を選ぶ' })).toBeInTheDocument(),
    )
  })
})
