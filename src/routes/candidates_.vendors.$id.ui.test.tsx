import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteVendor, getVendor, saveVendor } from '../server/candidates'
import { addComment, deleteComment, listCommentsFor } from '../server/comments'
import { listLinkTargets, savePlace } from '../server/places'
import { getBuildPlan, saveVendorResearch } from '../server/research'
import { getHomeAreas } from '../server/settings'
import { deleteVendorFavicon } from '../server/vendorImages'
import type { VendorResearch } from '../lib/research'
import { MEMBERS, comment, mockOf, place, stub, uid, vendor } from '../../test/ui/fixtures'

const V1 = uid(1)
const PAGE = `/candidates/vendors/${V1}`
import { flushPendingDeletes, renderRoute } from '../../test/ui/render'

const RESEARCH: VendorResearch = {
  version: 1,
  researchedOn: '2026-09-10',
  summary: '高断熱の平屋が得意',
  facts: { insulation: 'HEAT20 G2', hiraya: '年に10棟' },
  sections: [{ title: '設計の進め方', body: '最初に敷地を見に来る' }],
  sources: [{ label: '会社概要', url: 'https://example.com/about' }],
}

const FULL = vendor({
  id: V1,
  name: 'テスト工務店',
  hq: 'テスト市',
  representative: '山田',
  representativePhotoKey: 'vendors/v1/representative-1.jpg',
  faviconKey: 'vendors/v1/favicon-1.png',
  serviceAreas: ['テスト市', 'サンプル町'],
  uaValue: 0.46,
  cValuePublished: true,
  seismicGrade: 3,
  pricePerTsuboMin: 70,
  pricePerTsuboMax: 90,
  structure: '木造軸組',
  features: '自然素材を多く使う',
  websiteUrl: 'https://example.com/',
  sourceUrl: 'https://example.com/source',
  newsEmailDomain: 'example.com,mail.example.com',
  affiliations: ['iedukuri100'],
  affiliationLinks: { iedukuri100: { url: 'https://example.com/partner', note: '構造 ★★★' } },
  research: RESEARCH,
})

function load(v = FULL, places = [place({ id: 'pl1', name: 'テスト展示場', vendorId: V1 })]) {
  stub(getVendor, { vendor: v, places, coversHome: true })
}

describe('vendor detail route', () => {
  beforeEach(() => {
    load()
    stub(getHomeAreas, ['テスト市'])
    stub(listLinkTargets, { vendors: [{ id: V1, name: 'テスト工務店' }], properties: [] })
    stub(listCommentsFor, {
      comments: [
        comment({ id: 'c1', body: '担当者の説明が丁寧だった' }),
        comment({ id: 'c2', body: '見積もりが早かった', createdBy: 'partner@example.com' }),
      ],
      me: 'owner@example.com',
      members: MEMBERS,
    })
    stub(getBuildPlan, { plan: { floors: 1, tsuboMin: 28, tsuboMax: 32, budgetManYen: 3500 } })
  })

  it('shows the facts, research memo, affiliations, places and comments', async () => {
    await renderRoute(PAGE)
    expect(
      await screen.findByRole('heading', { level: 1, name: /テスト工務店/ }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: '候補' }).map((a) => a.getAttribute('href')),
    ).toContain('/candidates?tab=vendors')
    expect(screen.getByText('建築予定地が施工エリア内')).toBeInTheDocument()
    expect(screen.getByText('テスト市、サンプル町')).toBeInTheDocument()
    expect(screen.getByText('0.46 / 実測公開')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '用語集で 耐震等級 を見る' })).toBeInTheDocument()
    expect(screen.getByText('木造軸組')).toBeInTheDocument()
    expect(screen.getByText('example.com, mail.example.com')).toBeInTheDocument()
    expect(screen.getByText('自然素材を多く使う')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '計画に対する目安' })).toBeInTheDocument()
    expect(screen.getByText('平屋 28〜32坪・予算 3,500万円')).toBeInTheDocument()
    expect(screen.getByText('高断熱の平屋が得意')).toBeInTheDocument()
    expect(screen.getByText('HEAT20 G2')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '設計の進め方' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '会社概要' })).toHaveAttribute(
      'href',
      'https://example.com/about',
    )
    expect(screen.getByText('家づくり百貨（家百）')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '紹介ページ' })).toHaveAttribute(
      'href',
      'https://example.com/partner',
    )
    expect(screen.getByText('構造 ★★★')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /テスト展示場/ })).toHaveAttribute(
      'href',
      '/places/pl1',
    )
    expect(screen.getByText('担当者の説明が丁寧だった')).toBeInTheDocument()
    // Only my own comment can be deleted
    expect(screen.getAllByRole('button', { name: 'コメントを削除' })).toHaveLength(1)
  })

  it('leaves out the facts card and invites a research memo when nothing is registered', async () => {
    load(vendor({ id: V1, name: '空の工務店', hq: null }), [])
    stub(getBuildPlan, { plan: null })
    stub(listCommentsFor, { comments: [], me: 'owner@example.com', members: MEMBERS })
    await renderRoute(PAGE)
    await screen.findByRole('heading', { level: 1, name: /空の工務店/ })
    expect(screen.queryByText('本社')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '計画に対する目安' })).not.toBeInTheDocument()
    expect(screen.getByText(/まだ調べたことを書いていません/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '書く' })).toBeInTheDocument()
    expect(screen.getByText(/展示場・モデルハウスはまだ登録されていません/)).toBeInTheDocument()
    expect(screen.getByText('まだコメントはありません。')).toBeInTheDocument()
  })

  it('shows the in-app 404 for a malformed id', async () => {
    await renderRoute('/candidates/vendors/not%20an%20id')
    expect(await screen.findByText('見つかりません')).toBeInTheDocument()
    expect(getVendor).not.toHaveBeenCalled()
  })

  it('edits the vendor and reports a conflict instead of overwriting', async () => {
    const save = stub(saveVendor, { conflict: true })
    const { user } = await renderRoute(PAGE)
    await user.click((await screen.findAllByRole('button', { name: '編集' }))[0]!)
    const drawer = await screen.findByRole('dialog', { name: '業者を編集' })
    expect(within(drawer).getByRole('textbox', { name: '名前' })).toHaveValue('テスト工務店')
    expect(within(drawer).getByRole('textbox', { name: '紹介ページの URL（家百）' })).toHaveValue(
      'https://example.com/partner',
    )
    await user.clear(within(drawer).getByRole('textbox', { name: 'メモ' }))
    await user.type(within(drawer).getByRole('textbox', { name: 'メモ' }), '断熱 ★★')
    await user.click(within(drawer).getByRole('button', { name: '業者を保存' }))
    expect(await screen.findByText(/相手が先にこの内容を保存していた/)).toBeInTheDocument()
    expect(save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: V1,
        expectedUpdatedAt: FULL.updatedAt,
        affiliationLinks: { iedukuri100: { url: 'https://example.com/partner', note: '断熱 ★★' } },
      }),
    })
    expect(within(drawer).getByRole('button', { name: '業者を保存' })).toBeInTheDocument()
  })

  it('removes the site icon from the edit form', async () => {
    const remove = stub(deleteVendorFavicon, { ok: true })
    const { user } = await renderRoute(PAGE)
    await user.click((await screen.findAllByRole('button', { name: '編集' }))[0]!)
    const drawer = await screen.findByRole('dialog', { name: '業者を編集' })
    // The representative photo's 削除 (Delete) comes first, then the site icon's
    await user.click(within(drawer).getAllByRole('button', { name: '削除' })[1]!)
    expect(await screen.findByText('サイトのアイコンを削除しました')).toBeInTheDocument()
    expect(remove).toHaveBeenCalledWith({ data: { vendorId: V1 } })
  })

  it('writes a research memo with a section and a source', async () => {
    load({ ...FULL, research: null })
    const save = stub(saveVendorResearch, { ok: true })
    const { user } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: '書く' }))
    const drawer = await screen.findByRole('dialog', { name: '調査メモ' })
    await user.type(within(drawer).getByRole('textbox', { name: '一言で' }), '説明が丁寧')
    await user.type(within(drawer).getByRole('textbox', { name: '断熱' }), 'G2')
    await user.click(within(drawer).getByRole('button', { name: '節を追加' }))
    await user.click(within(drawer).getByRole('button', { name: '出典を追加' }))
    await user.click(within(drawer).getByRole('button', { name: '調査メモを保存' }))
    expect(await within(drawer).findByText('見出しは必須です')).toBeInTheDocument()
    expect(within(drawer).getByText('出典名は必須です')).toBeInTheDocument()
    expect(within(drawer).getByText('URL は https:// で始めてください')).toBeInTheDocument()

    await user.click(within(drawer).getByRole('button', { name: 'この節を削除' }))
    await user.type(within(drawer).getByRole('textbox', { name: '出典名' }), 'パンフレット')
    await user.type(within(drawer).getByRole('textbox', { name: 'URL' }), 'https://example.com/pdf')
    await user.click(within(drawer).getByRole('button', { name: '調査メモを保存' }))
    expect(await screen.findByText('調査メモを保存しました')).toBeInTheDocument()
    expect(save).toHaveBeenCalledWith({
      data: {
        id: V1,
        research: expect.objectContaining({
          summary: '説明が丁寧',
          facts: { insulation: 'G2' },
          sections: [],
          sources: [{ label: 'パンフレット', url: 'https://example.com/pdf' }],
        }),
      },
    })
  })

  it('deletes the research memo with undo', async () => {
    const save = stub(saveVendorResearch, { ok: true })
    const { user } = await renderRoute(PAGE)
    // The first 編集 (Edit) is the vendor's own; the research memo has its own
    await user.click((await screen.findAllByRole('button', { name: '編集' }))[1]!)
    const drawer = await screen.findByRole('dialog', { name: '調査メモ' })
    await user.click(within(drawer).getByRole('button', { name: '調査メモを削除' }))
    expect(await screen.findByText('調査メモを削除しました')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('高断熱の平屋が得意')).not.toBeInTheDocument())
    flushPendingDeletes()
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ data: { id: V1, research: null } }),
      ),
    )
  })

  it('adds a place for the vendor, looking up the address', async () => {
    const save = stub(savePlace, { id: 'pl2' })
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ lat: 35.5, lng: 139.5, title: 'テスト市役所' })),
      )
    const { user } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: '場所を追加' }))
    const drawer = await screen.findByRole('dialog', { name: '場所を追加' })
    await user.type(within(drawer).getByRole('textbox', { name: '名前' }), '新しいモデルハウス')
    await user.type(within(drawer).getByRole('textbox', { name: '住所' }), 'テスト市1-1')
    await user.click(within(drawer).getByRole('button', { name: '住所から座標を引く' }))
    expect(
      await within(drawer).findByText(/この住所で引きました: テスト市役所/),
    ).toBeInTheDocument()
    expect(within(drawer).getByText('地図に出す位置: 35.5,139.5')).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: '場所を保存' }))
    expect(await screen.findByText('場所を追加しました')).toBeInTheDocument()
    expect(save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '新しいモデルハウス',
        vendorId: V1,
        lat: 35.5,
        geocodeSource: 'gsi',
      }),
    })
    fetchMock.mockRestore()
  })

  it('posts a comment and deletes my own with undo', async () => {
    const add = stub(addComment, { id: 'c3' })
    const remove = stub(deleteComment, { ok: true })
    const { user } = await renderRoute(PAGE)
    const box = await screen.findByPlaceholderText('一言どうぞ')
    expect(screen.getByRole('button', { name: '送信' })).toBeDisabled()
    await user.type(box, '次回は構造見学会へ')
    expect(window.localStorage.length).toBe(1)
    await user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith({
        data: { targetType: 'vendor', targetId: V1, body: '次回は構造見学会へ' },
      }),
    )
    await waitFor(() => expect(box).toHaveValue(''))

    await user.click(screen.getByRole('button', { name: 'コメントを削除' }))
    expect(await screen.findByText('コメントを削除しました')).toBeInTheDocument()
    expect(screen.queryByText('担当者の説明が丁寧だった')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '元に戻す' }))
    expect(await screen.findByText('担当者の説明が丁寧だった')).toBeInTheDocument()
    flushPendingDeletes()
    expect(remove).not.toHaveBeenCalled()
  })

  it('tells when a comment could not be sent', async () => {
    mockOf(addComment).mockRejectedValue(new Error('offline'))
    const { user } = await renderRoute(PAGE)
    await user.type(await screen.findByPlaceholderText('一言どうぞ'), 'テスト')
    await user.click(screen.getByRole('button', { name: '送信' }))
    expect(await screen.findByText('送信できませんでした')).toBeInTheDocument()
  })

  it('deletes the vendor and returns to the list', async () => {
    const remove = stub(deleteVendor, { ok: true })
    const { user, router } = await renderRoute(PAGE)
    await user.click(await screen.findByRole('button', { name: 'この業者を削除' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/candidates'))
    expect(await screen.findByText('「テスト工務店」を削除しました')).toBeInTheDocument()
    flushPendingDeletes()
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(expect.objectContaining({ data: { id: V1 } })),
    )
  })
})
