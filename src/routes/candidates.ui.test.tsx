import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listCandidates, saveProperty, saveVendor } from '../server/candidates'
import { mockOf, property, stub, vendor } from '../../test/ui/fixtures'
import { renderRoute } from '../../test/ui/render'

function row(over: Parameters<typeof vendor>[0] = {}) {
  return { ...vendor(over), coversHome: false, placeCount: 0 }
}

describe('candidates route', () => {
  beforeEach(() => {
    stub(listCandidates, {
      homeAreas: ['テスト市'],
      vendors: [
        row({
          id: 'v1',
          name: 'テスト工務店',
          representative: '山田',
          uaValue: 0.46,
          cValuePublished: true,
          seismicGrade: 3,
          longTermCertified: true,
          pricePerTsuboMin: 70,
          pricePerTsuboMax: 90,
          websiteUrl: 'https://example.com/',
          socialUrls: ['https://www.instagram.com/example'],
        }),
        {
          ...row({ id: 'v2', name: 'サンプルハウス', kind: 'hm', status: 'shortlisted' }),
          coversHome: true,
          placeCount: 2,
        },
        row({ id: 'v3', name: '見本デベロッパー', kind: 'developer', status: 'dropped' }),
      ],
      properties: [property({ id: 'p1', name: 'テストレジデンス' })],
    })
  })

  it('groups vendors by kind with their key facts', async () => {
    await renderRoute('/candidates')
    expect(await screen.findByRole('heading', { name: '工務店（1）' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ハウスメーカー（1）' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'その他（1）' })).toBeInTheDocument()
    expect(screen.getByText('代表: 山田')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '用語集で UA値 を見る' })).toBeInTheDocument()
    expect(screen.getByText('C値公開')).toBeInTheDocument()
    expect(screen.getByText('耐震等級 3')).toBeInTheDocument()
    expect(screen.getByText('長期優良')).toBeInTheDocument()
    expect(screen.getByText('建築予定地が施工エリア内')).toBeInTheDocument()
    expect(screen.getByText('2 箇所')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '公式サイト' })).toHaveAttribute(
      'href',
      'https://example.com/',
    )
    expect(screen.getByRole('link', { name: 'Instagram' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '比較表' })).toHaveAttribute(
      'href',
      '/candidates/compare',
    )
  })

  it('filters by status and shows an empty state when nothing matches', async () => {
    const { user, router } = await renderRoute('/candidates')
    await user.click(await screen.findByRole('radio', { name: '本命' }))
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ status: 'shortlisted' }),
    )
    expect(screen.getByText('サンプルハウス')).toBeInTheDocument()
    expect(screen.queryByText('テスト工務店')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '相談中' }))
    expect(await screen.findByText('業者がありません')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'すべて' }))
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('status'))
    expect(screen.getByText('テスト工務店')).toBeInTheDocument()
  })

  it('switches to condominiums and back', async () => {
    const { user, router } = await renderRoute('/candidates')
    await user.click(await screen.findByText('マンション 1'))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'properties' }))
    expect(screen.getByRole('link', { name: /テストレジデンス/ })).toHaveAttribute(
      'href',
      '/candidates/properties/p1',
    )
    expect(screen.getByText('テスト駅 徒歩8分')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '比較表' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '物件を追加' })).toBeInTheDocument()
  })

  it('hides the vendor/condominium switch when there are no properties', async () => {
    stub(listCandidates, { homeAreas: [], vendors: [row()], properties: [] })
    await renderRoute('/candidates')
    await screen.findByText('テスト工務店')
    expect(screen.queryByRole('radiogroup', { name: '表示の切替' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '比較表' })).not.toBeInTheDocument()
  })

  it('shows an empty state for condominiums', async () => {
    stub(listCandidates, { homeAreas: [], vendors: [], properties: [] })
    await renderRoute('/candidates?tab=properties')
    expect(await screen.findByText('物件がありません')).toBeInTheDocument()
  })

  it('checks the input and adds a vendor, then opens its page', async () => {
    const save = stub(saveVendor, { id: 'new-vendor' })
    const { user, router } = await renderRoute('/candidates')
    await user.click(await screen.findByRole('button', { name: '業者を追加' }))
    const drawer = await screen.findByRole('dialog', { name: '候補を追加' })
    expect(within(drawer).getByText('建築予定地: テスト市')).toBeInTheDocument()
    expect(
      within(drawer).getByText('保存するとアイコンを手動アップロードできます'),
    ).toBeInTheDocument()

    await user.click(within(drawer).getByRole('button', { name: '業者を保存' }))
    // The browser's own required check stops the empty submit
    expect(within(drawer).getByRole('textbox', { name: '名前' })).toBeInvalid()
    expect(save).not.toHaveBeenCalled()

    await user.type(within(drawer).getByRole('textbox', { name: '名前' }), '新しい工務店')
    await user.type(
      within(drawer).getByRole('textbox', { name: 'お知らせの URL' }),
      'http://example.com/',
    )
    await user.click(within(drawer).getByRole('button', { name: '業者を保存' }))
    expect(await within(drawer).findByText('URL は https:// で始めてください')).toBeInTheDocument()

    await user.clear(within(drawer).getByRole('textbox', { name: 'お知らせの URL' }))
    await user.type(
      within(drawer).getByRole('textbox', { name: 'SNS の URL（1 行に 1 つ）' }),
      'https://x.com/example',
    )
    await user.click(within(drawer).getByRole('button', { name: '業者を保存' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/candidates/vendors/new-vendor'),
    )
    expect(save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '新しい工務店',
        socialUrls: ['https://x.com/example'],
      }),
    })
    expect(await screen.findByText('業者を追加しました')).toBeInTheDocument()
  })

  it('shows the server reason when saving a vendor fails', async () => {
    mockOf(saveVendor).mockRejectedValue(new Error('名前が長すぎます'))
    const { user } = await renderRoute('/candidates')
    await user.click(await screen.findByRole('button', { name: '業者を追加' }))
    const drawer = await screen.findByRole('dialog', { name: '候補を追加' })
    await user.type(within(drawer).getByRole('textbox', { name: '名前' }), '長い名前')
    await user.click(within(drawer).getByRole('button', { name: '業者を保存' }))
    expect(await screen.findByText('名前が長すぎます')).toBeInTheDocument()
  })

  it('adds a condominium from the same drawer and keeps each draft', async () => {
    const save = stub(saveProperty, { id: 'new-property' })
    const { user, router } = await renderRoute('/candidates')
    await user.click(await screen.findByRole('button', { name: '業者を追加' }))
    const drawer = await screen.findByRole('dialog', { name: '候補を追加' })
    await user.type(within(drawer).getByRole('textbox', { name: '名前' }), '下書きの工務店')

    await user.click(within(drawer).getByText('マンション（物件）'))
    const name = within(drawer).getByRole('textbox', { name: '名前' })
    expect(name).toHaveValue('')
    await user.type(name, '新しいマンション')
    await user.click(within(drawer).getByRole('button', { name: '物件を保存' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/candidates/properties/new-property'),
    )
    expect(save).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: '新しいマンション' }),
    })
  })

  it('opens a vendor from anywhere on its card', async () => {
    const { user, router } = await renderRoute('/candidates')
    await user.click(await screen.findByText('代表: 山田'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/candidates/vendors/v1'))
  })

  it('keeps an unfinished vendor on the device and can discard it', async () => {
    const { user } = await renderRoute('/candidates')
    await user.click(await screen.findByRole('button', { name: '業者を追加' }))
    let drawer = await screen.findByRole('dialog', { name: '候補を追加' })
    await user.type(within(drawer).getByRole('textbox', { name: '名前' }), '書きかけ工務店')
    await waitFor(() => expect(window.localStorage.length).toBe(1))
    await user.click(within(drawer).getByRole('button', { name: '閉じる' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '業者を追加' }))
    drawer = await screen.findByRole('dialog', { name: '候補を追加' })
    expect(await within(drawer).findByRole('status')).toHaveTextContent(
      '書きかけの下書きを戻しました',
    )
    expect(within(drawer).getByRole('textbox', { name: '名前' })).toHaveValue('書きかけ工務店')
    await user.click(within(drawer).getByRole('button', { name: '破棄' }))
    expect(within(drawer).getByRole('textbox', { name: '名前' })).toHaveValue('')
    expect(within(drawer).queryByText('書きかけの下書きを戻しました')).not.toBeInTheDocument()
  })
})

describe('form drawer on a phone', () => {
  const listeners: Record<string, () => void> = {}

  beforeEach(() => {
    stub(listCandidates, { homeAreas: [], vendors: [], properties: [] })
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
    vi.stubGlobal('visualViewport', {
      height: 400,
      offsetTop: 20,
      addEventListener: (type: string, fn: () => void) => {
        listeners[type] = fn
      },
      removeEventListener: (type: string) => {
        delete listeners[type]
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fits above the soft keyboard and lets go when closed', async () => {
    const { user } = await renderRoute('/candidates')
    await user.click(await screen.findByRole('button', { name: '業者を追加' }))
    const drawer = await screen.findByRole('dialog', { name: '候補を追加' })
    const root = document.documentElement
    expect(root.style.getPropertyValue('--form-drawer-height')).toBe('400px')
    expect(root.style.getPropertyValue('--form-drawer-top')).toBe('20px')
    within(drawer).getByRole('textbox', { name: '名前' }).focus()
    listeners.resize?.()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    await user.click(within(drawer).getByRole('button', { name: '閉じる' }))
    await waitFor(() => expect(root.style.getPropertyValue('--form-drawer-height')).toBe(''))
    expect(listeners.resize).toBeUndefined()
  })
})
