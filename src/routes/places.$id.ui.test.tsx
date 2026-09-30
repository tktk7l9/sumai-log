import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listCommentsFor } from '../server/comments'
import { getMapConfig } from '../server/mapConfig'
import { deletePlace, getPlace, listLinkTargets, savePlace } from '../server/places'
import { MEMBERS, place, property, stub, uid, vendor } from '../../test/ui/fixtures'
import { flushPendingDeletes, renderRoute } from '../../test/ui/render'

vi.mock('../components/map/PlacesMap', () => import('../../test/ui/mapStub'))

const ID = uid(51)
const PAGE = `/places/${ID}`

describe('place detail route', () => {
  beforeEach(() => {
    stub(getPlace, {
      place: place({
        id: ID,
        lat: 35.5,
        lng: 139.5,
        geocodeSource: 'manual',
        coordsText: '35.5, 139.5',
        note: '駐車場あり',
      }),
      vendor: vendor({ id: 'v1' }),
      property: property({ id: 'p1' }),
      visited: true,
    })
    stub(listLinkTargets, { vendors: [{ id: 'v1', name: 'テスト工務店' }], properties: [] })
    stub(listCommentsFor, { comments: [], me: 'owner@example.com', members: MEMBERS })
    stub(getMapConfig, { apiKey: 'test-key', mapId: 'DEMO_MAP_ID' })
  })

  it('shows the place on the map with its links', async () => {
    await renderRoute(PAGE)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'テスト展示場' }),
    ).toBeInTheDocument()
    expect(screen.getByText('住宅展示場')).toBeInTheDocument()
    expect(screen.getByText('テスト市4-5-6')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'テスト工務店' })).toHaveAttribute(
      'href',
      '/candidates/vendors/v1',
    )
    expect(screen.getByRole('link', { name: 'テストレジデンス' })).toHaveAttribute(
      'href',
      '/candidates/properties/p1',
    )
    expect(
      await screen.findByRole('button', { name: 'ピン: テスト展示場（見学済み）' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('座標は手貼り（35.5, 139.5）')).toBeInTheDocument()
    expect(screen.getByText('駐車場あり')).toBeInTheDocument()
    // A place with visit records cannot be deleted; say why up front
    expect(screen.getByText(/見学記録がある場所は削除できません/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'この場所を削除' })).toBeDisabled()
  })

  it('explains why there is no map and drops the empty rows', async () => {
    stub(getPlace, { place: place({ id: ID }), vendor: null, property: null, visited: false })
    const { unmount } = await renderRoute(PAGE)
    expect(
      await screen.findByText(
        '住所から座標を引けていないため地図を出せません。編集して座標を貼ってください。',
      ),
    ).toBeInTheDocument()
    unmount()

    stub(getPlace, {
      place: place({ id: ID, address: null }),
      vendor: null,
      property: null,
      visited: false,
    })
    await renderRoute(PAGE)
    expect(
      await screen.findByText('住所も座標も登録されていないため地図を出せません。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('住所')).not.toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
    // Nothing to show: no empty frame either
    const cards = [...document.querySelectorAll('main .mantine-Card-root')]
    expect(cards.filter((card) => !card.textContent?.trim())).toHaveLength(0)
  })

  it('keeps the vendor row but drops the address row when only the address is missing', async () => {
    stub(getPlace, {
      place: place({ id: ID, address: null }),
      vendor: vendor({ id: 'v1' }),
      property: null,
      visited: false,
    })
    await renderRoute(PAGE)
    expect(await screen.findByText('業者')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'テスト工務店' })).toBeInTheDocument()
    expect(screen.queryByText('住所')).not.toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('edits the place', async () => {
    const save = stub(savePlace, { id: ID })
    const { user } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: '編集' }))
    const drawer = await screen.findByRole('dialog', { name: '場所を編集' })
    await user.type(within(drawer).getByRole('textbox', { name: 'メモ' }), '。土日は混む')
    await user.click(within(drawer).getByRole('button', { name: '場所を保存' }))
    expect(await screen.findByText('場所を更新しました')).toBeInTheDocument()
    expect(save).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: ID, note: '駐車場あり。土日は混む' }),
    })
  })

  it('clears looked-up coordinates when the address changes, and reports a miss', async () => {
    stub(getPlace, {
      place: place({ id: ID, lat: 35.5, lng: 139.5, geocodeSource: 'gsi' }),
      vendor: null,
      property: null,
      visited: false,
    })
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 404 }))
    const { user } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: '編集' }))
    const drawer = await screen.findByRole('dialog', { name: '場所を編集' })
    expect(within(drawer).getByText(/座標は前回の住所検索の結果です/)).toBeInTheDocument()
    await user.type(within(drawer).getByRole('textbox', { name: '住所' }), '7')
    expect(
      within(drawer).getByText('座標が無いので地図には出ません（一覧と詳細には出ます）'),
    ).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: '住所から座標を引く' }))
    expect(await within(drawer).findByText(/見つかりませんでした/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(`/api/geocode?q=${encodeURIComponent('テスト市4-5-67')}`)
    fetchMock.mockRestore()
  })

  it('deletes a place and reports when the server refuses', async () => {
    stub(getPlace, { place: place({ id: ID }), vendor: null, property: null, visited: false })
    const remove = stub(deletePlace, { ok: false })
    const { user, router } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: 'この場所を削除' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/map'))
    flushPendingDeletes()
    await waitFor(() => expect(remove).toHaveBeenCalled())
    expect(await screen.findByText('見学記録があるため消せません')).toBeInTheDocument()
  })
})
