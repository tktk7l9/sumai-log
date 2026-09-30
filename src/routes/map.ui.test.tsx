import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getMapConfig } from '../server/mapConfig'
import { listLinkTargets, listPlaces, savePlace } from '../server/places'
import { place, stub } from '../../test/ui/fixtures'
import { renderRoute } from '../../test/ui/render'

vi.mock('../components/map/PlacesMap', () => import('../../test/ui/mapStub'))

function row(
  over: Parameters<typeof place>[0],
  links: { vendorName?: string; propertyName?: string; visited?: boolean } = {},
) {
  return {
    ...place(over),
    vendorName: links.vendorName ?? null,
    propertyName: links.propertyName ?? null,
    visitCount: links.visited ? 1 : 0,
    visited: links.visited ?? false,
  }
}

const PLACES = [
  row(
    { id: 'pl1', name: 'テスト展示場', lat: 35.5, lng: 139.5 },
    { vendorName: 'テスト工務店', visited: true },
  ),
  row(
    { id: 'pl2', name: 'サンプルギャラリー', kind: 'gallery', lat: 35.6, lng: 139.6 },
    { propertyName: 'テストレジデンス' },
  ),
  row({ id: 'pl3', name: '座標なしの現地', kind: 'site', address: null }),
]

describe('map route', () => {
  beforeEach(() => {
    stub(listPlaces, PLACES)
    stub(listLinkTargets, { vendors: [], properties: [] })
    stub(getMapConfig, { apiKey: 'test-key', mapId: 'DEMO_MAP_ID' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('puts places with coordinates on the map and filters them', async () => {
    const { user } = await renderRoute('/map')
    expect(
      await screen.findByRole('button', { name: 'ピン: テスト展示場（見学済み）' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ピン: サンプルギャラリー' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /座標なしの現地/ })).not.toBeInTheDocument()

    await user.click(screen.getByText('行った'))
    expect(
      screen.queryByRole('button', { name: 'ピン: サンプルギャラリー' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByText('予定だけ'))
    expect(screen.getByRole('button', { name: 'ピン: サンプルギャラリー' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /テスト展示場/ })).not.toBeInTheDocument()
  })

  it('opens a sheet for a tapped pin', async () => {
    const { user } = await renderRoute('/map')
    await user.click(await screen.findByRole('button', { name: 'ピン: テスト展示場（見学済み）' }))
    const sheet = await screen.findByRole('dialog', { name: 'テスト展示場' })
    expect(within(sheet).getByText('業者: テスト工務店')).toBeInTheDocument()
    expect(within(sheet).getByText('テスト市4-5-6')).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: '詳細を見る' })).toHaveAttribute(
      'href',
      '/places/pl1',
    )
    await user.click(within(sheet).getByRole('button', { name: '閉じる' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'ピン: サンプルギャラリー' }))
    expect(await screen.findByText('マンション物件: テストレジデンス')).toBeInTheDocument()
  })

  it('points to the list for places that cannot go on the map', async () => {
    const { user, router } = await renderRoute('/map')
    await user.click(await screen.findByText('地図に出せない場所が 1 件（押すと一覧表示）'))
    await waitFor(() => expect(router.state.location.search).toEqual({ view: 'list' }))
    const card = screen.getByRole('link', { name: /座標なしの現地/ })
    expect(
      within(card).getByText('住所から座標を出せないため地図には出せません'),
    ).toBeInTheDocument()
    expect(within(card).getByText('予定')).toBeInTheDocument()
    const visited = screen.getByRole('link', { name: /テスト展示場/ })
    expect(within(visited).getByText('行った')).toBeInTheDocument()
    expect(within(visited).getByText('テスト工務店')).toBeInTheDocument()

    await user.click(screen.getByText('予定だけ'))
    expect(screen.queryByRole('link', { name: /テスト展示場/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '地図' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ view: 'map' }))
  })

  it('falls back to the list from the map', async () => {
    const { user, router } = await renderRoute('/map')
    await user.click(await screen.findByRole('button', { name: '地図の代わりに一覧' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ view: 'list' }))
  })

  it('shows an empty list', async () => {
    stub(listPlaces, [])
    await renderRoute('/map?view=list')
    expect(await screen.findByText('場所がありません')).toBeInTheDocument()
  })

  it('moves to the current location, or says it could not', async () => {
    const getCurrentPosition = vi.fn(
      (ok: PositionCallback, fail?: PositionErrorCallback | null) => {
        if (getCurrentPosition.mock.calls.length === 1) {
          ok({ coords: { latitude: 35.7, longitude: 139.7 } } as GeolocationPosition)
        } else {
          fail?.({ code: 1 } as GeolocationPositionError)
        }
      },
    )
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })
    const { user } = await renderRoute('/map')
    await user.click(await screen.findByRole('button', { name: '現在地' }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('現在地を取得できませんでした')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '現在地' }))
    expect(await screen.findByText('現在地を取得できませんでした')).toBeInTheDocument()
  })

  it('says so when the browser has no geolocation', async () => {
    vi.stubGlobal('navigator', { ...navigator, geolocation: undefined })
    const { user } = await renderRoute('/map')
    await user.click(await screen.findByRole('button', { name: '現在地' }))
    expect(await screen.findByText('現在地を取得できませんでした')).toBeInTheDocument()
  })

  it('adds a place from the map', async () => {
    const save = stub(savePlace, { id: 'pl4' })
    const { user } = await renderRoute('/map')
    await user.click(await screen.findByRole('button', { name: '場所を追加' }))
    const drawer = await screen.findByRole('dialog', { name: '場所を追加' })
    await user.type(within(drawer).getByRole('textbox', { name: '名前' }), '新しい展示場')
    await user.click(within(drawer).getByRole('button', { name: '場所を保存' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: '新しい展示場', kind: 'model_house' }),
      }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '場所を追加' })).not.toBeInTheDocument(),
    )
  })
})
