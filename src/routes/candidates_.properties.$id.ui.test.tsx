import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { deleteProperty, getProperty, saveProperty } from '../server/candidates'
import { listCommentsFor } from '../server/comments'
import { listLinkTargets, savePlace } from '../server/places'
import { MEMBERS, mockOf, place, property, stub, uid } from '../../test/ui/fixtures'
import { flushPendingDeletes, renderRoute } from '../../test/ui/render'

const P1 = uid(11)
const PAGE = `/candidates/properties/${P1}`

describe('property detail route', () => {
  beforeEach(() => {
    stub(getProperty, {
      property: property({
        id: P1,
        listingUrl: 'https://example.com/listing',
        note: '南向きの角部屋',
      }),
      places: [place({ id: 'pl9', name: 'テストギャラリー', kind: 'gallery' })],
    })
    stub(listLinkTargets, { vendors: [], properties: [{ id: P1, name: 'テストレジデンス' }] })
    stub(listCommentsFor, { comments: [], me: 'owner@example.com', members: MEMBERS })
  })

  it('shows the registered facts, note and places', async () => {
    await renderRoute(PAGE)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'テストレジデンス' }),
    ).toBeInTheDocument()
    expect(screen.getByText('テスト市1-2-3')).toBeInTheDocument()
    expect(screen.getByText('テスト駅 徒歩8分')).toBeInTheDocument()
    expect(screen.getByText('4,500万円')).toBeInTheDocument()
    expect(screen.getByText('70.50㎡')).toBeInTheDocument()
    expect(screen.getByText('2020年')).toBeInTheDocument()
    expect(screen.getByText('管理費・修繕積立金')).toBeInTheDocument()
    expect(screen.getByText('1万円 / 9,000円')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '開く' })).toHaveAttribute(
      'href',
      'https://example.com/listing',
    )
    expect(screen.getByText('南向きの角部屋')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /テストギャラリー/ })).toHaveAttribute(
      'href',
      '/places/pl9',
    )
  })

  it('drops the rows that are not registered instead of showing a dash', async () => {
    stub(getProperty, {
      property: property({
        id: P1,
        address: null,
        station: null,
        walkMinutes: 5,
        price: null,
        areaSqm: null,
        layout: null,
        builtYear: null,
        completionDate: '2027-03',
        managementFee: null,
      }),
      places: [],
    })
    await renderRoute(PAGE)
    await screen.findByRole('heading', { level: 1, name: 'テストレジデンス' })
    expect(screen.getByText('徒歩5分')).toBeInTheDocument()
    expect(screen.getByText('竣工予定')).toBeInTheDocument()
    expect(screen.getByText('修繕積立金')).toBeInTheDocument()
    for (const label of ['所在地', '価格', '専有面積', '間取り', '築年', '掲載URL']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
    expect(screen.queryByText('—')).not.toBeInTheDocument()
    expect(screen.getByText(/ギャラリー・現地はまだ登録されていません/)).toBeInTheDocument()
  })

  it('leaves out the facts card when nothing is registered', async () => {
    stub(getProperty, {
      property: property({
        id: P1,
        address: null,
        station: null,
        walkMinutes: null,
        price: null,
        areaSqm: null,
        layout: null,
        builtYear: null,
        managementFee: null,
        repairReserve: null,
      }),
      places: [],
    })
    await renderRoute(PAGE)
    await screen.findByRole('heading', { level: 1, name: 'テストレジデンス' })
    expect(screen.queryByText('—')).not.toBeInTheDocument()
    expect(screen.queryByText('竣工予定')).not.toBeInTheDocument()
    expect(document.querySelector('main .mantine-Card-root')).toBeNull()
  })

  it('edits the property', async () => {
    const save = stub(saveProperty, { id: P1 })
    const { user } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: '編集' }))
    const drawer = await screen.findByRole('dialog', { name: '物件を編集' })
    const layout = within(drawer).getByRole('textbox', { name: '間取り' })
    await user.clear(layout)
    await user.type(layout, '2LDK')
    await user.click(within(drawer).getByRole('button', { name: '物件を保存' }))
    expect(await screen.findByText('物件を更新しました')).toBeInTheDocument()
    expect(save).toHaveBeenCalledWith({ data: expect.objectContaining({ id: P1, layout: '2LDK' }) })
  })

  it('tells when saving fails', async () => {
    mockOf(saveProperty).mockRejectedValue(new Error('boom'))
    const { user } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: '編集' }))
    const drawer = await screen.findByRole('dialog', { name: '物件を編集' })
    await user.click(within(drawer).getByRole('button', { name: '物件を保存' }))
    expect(await screen.findByText('保存できませんでした')).toBeInTheDocument()
  })

  it('adds a place linked to the property, with pasted coordinates', async () => {
    const save = stub(savePlace, { id: 'pl10' })
    const { user } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: '場所を追加' }))
    const drawer = await screen.findByRole('dialog', { name: '場所を追加' })
    expect(
      within(drawer).getByText('座標が無いので地図には出ません（一覧と詳細には出ます）'),
    ).toBeInTheDocument()
    await user.type(within(drawer).getByRole('textbox', { name: '名前' }), '現地')
    const coords = within(drawer).getByRole('textbox', { name: '座標を手貼り（任意）' })
    await user.type(coords, 'somewhere')
    await user.click(within(drawer).getByRole('button', { name: '場所を保存' }))
    expect(await within(drawer).findByText(/座標の形式が読めません/)).toBeInTheDocument()
    await user.clear(coords)
    await user.type(coords, '35.5, 139.5')
    expect(within(drawer).getByText('地図に出す位置: 35.5,139.5')).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: '場所を保存' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: '現地', propertyId: P1, coordsText: '35.5, 139.5' }),
      }),
    )
  })

  it('deletes the property and returns to the condominium list', async () => {
    const remove = stub(deleteProperty, { ok: true })
    const { user, router } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: 'この物件を削除' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'properties' }))
    flushPendingDeletes()
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(expect.objectContaining({ data: { id: P1 } })),
    )
  })

  it('shows the in-app 404 when the property is gone', async () => {
    await renderRoute('/candidates/properties/bad')
    expect(await screen.findByText('見つかりません')).toBeInTheDocument()
  })
})
