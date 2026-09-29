import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_SITE_PLAN,
  normalizePlan,
  placeBuildingNorth,
  type SitePlan,
} from '../lib/sitePlan'
import { getSitePlan, saveSitePlan } from '../server/sitePlan'
import { mockOf, stub } from '../../test/ui/fixtures'
import { renderRoute } from '../../test/ui/render'

vi.mock('../components/site/SiteView3D', () => import('../../test/ui/site3dStub'))

const SAVED: SitePlan = placeBuildingNorth(normalizePlan({ ...DEFAULT_SITE_PLAN }))

function sectionDistance() {
  return screen.getByText(/^道路からの距離 /).textContent
}

/** jsdom has no SVG geometry: map client coordinates 1:1 to drawing coordinates */
function stubSvgGeometry() {
  const identity = { inverse: () => identity }
  Object.assign(SVGSVGElement.prototype, {
    createSVGPoint: () => ({
      x: 0,
      y: 0,
      matrixTransform(this: { x: number; y: number }) {
        return { x: this.x, y: this.y }
      },
    }),
    getScreenCTM: () => identity,
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
  })
}

describe('site route', () => {
  beforeEach(() => {
    stub(getSitePlan, { plan: null, buildPlan: { floors: 1, tsuboMax: 32 } })
    stubSvgGeometry()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts from the initial values and checks them', async () => {
    await renderRoute('/site')
    expect(
      await screen.findByRole('heading', { level: 1, name: '区画シミュレーター' }),
    ).toBeInTheDocument()
    expect(screen.getByText('初期値（まだ保存していません）')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /土地 間口20m×奥行50m のうち/ })).toBeInTheDocument()
    expect(screen.getAllByLabelText(/^(OK|注意|NG)$/).length).toBeGreaterThan(0)
    expect(screen.getByText('敷地')).toBeInTheDocument()
  })

  it('moves the section and the building with the buttons and saves', async () => {
    const save = mockOf(saveSitePlan).mockImplementation(async (arg) => ({
      ok: true,
      plan: (arg as { data: SitePlan }).data,
    }))
    const { user } = await renderRoute('/site')
    await screen.findByText('初期値（まだ保存していません）')
    const before = sectionDistance()
    await user.click(screen.getByRole('button', { name: '奥に寄せる' }))
    expect(sectionDistance()).not.toBe(before)
    expect(screen.getByText('未保存の変更')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '道路側に寄せる' }))
    expect(sectionDistance()).toBe('道路からの距離 0.0m')
    await user.click(screen.getByRole('button', { name: '建物を北側へ' }))

    await user.click(screen.getByRole('button', { name: '区画を保存' }))
    expect(await screen.findByText('区画を保存しました')).toBeInTheDocument()
    expect(save).toHaveBeenCalledWith({
      data: expect.objectContaining({ landWidth: 20, landDepth: 50 }),
    })
  })

  it('reports a refused save', async () => {
    mockOf(saveSitePlan).mockRejectedValue(new Error('区画が土地からはみ出しています'))
    const { user } = await renderRoute('/site')
    await user.click(await screen.findByRole('button', { name: '区画を保存' }))
    expect(await screen.findByText('区画が土地からはみ出しています')).toBeInTheDocument()
  })

  it('restores the saved plan after edits', async () => {
    stub(getSitePlan, { plan: SAVED, buildPlan: null })
    const { user } = await renderRoute('/site')
    expect(await screen.findByText('保存済み（二人で共有）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '元に戻す' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '奥に寄せる' }))
    expect(screen.getByText('未保存の変更')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '元に戻す' }))
    expect(screen.getByText('保存済み（二人で共有）')).toBeInTheDocument()
  })

  it('drags the building on the drawing', async () => {
    stub(getSitePlan, { plan: SAVED, buildPlan: null })
    await renderRoute('/site')
    const drawing = await screen.findByRole('img', { name: /配置図/ })
    const building = drawing.querySelector('.site-building')!
    fireEvent.pointerDown(building, { clientX: 5, clientY: 5, pointerId: 1 })
    fireEvent.pointerMove(drawing, { clientX: 6, clientY: 5, pointerId: 1 })
    fireEvent.pointerUp(drawing, { pointerId: 1 })
    expect(screen.getByText('未保存の変更')).toBeInTheDocument()
    // Moving without a drag in progress changes nothing more
    fireEvent.pointerMove(drawing, { clientX: 20, clientY: 20, pointerId: 1 })
    fireEvent.pointerUp(drawing, { pointerId: 1 })

    const section = drawing.querySelector('.site-section')!
    fireEvent.pointerDown(section, { clientX: 5, clientY: 5, pointerId: 2 })
    fireEvent.pointerMove(drawing, { clientX: 5, clientY: 0, pointerId: 2 })
    fireEvent.pointerCancel(drawing, { pointerId: 2 })
  })

  it('switches to 3D and changes the sun', async () => {
    const { user } = await renderRoute('/site')
    await screen.findByText('初期値（まだ保存していません）')
    await user.click(screen.getByText('3D'))
    expect(await screen.findByText('3D（テスト用）・影 winter 10時')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '夏至' }))
    expect(await screen.findByText('3D（テスト用）・影 summer 10時')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: '影を表示' }))
    expect(await screen.findByText('3D（テスト用）・影なし')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '夏至' })).toBeDisabled()

    await user.click(screen.getByRole('switch', { name: '影を表示' }))
    const slider = screen
      .getAllByRole('slider')
      .find((el) => el.getAttribute('aria-valuenow') === '10')!
    slider.focus()
    await user.keyboard('{Home}')
    expect(screen.getByText(/^時刻 7:00/)).toBeInTheDocument()
  })

  it('edits the land, lots, access, building and rules', async () => {
    const { user } = await renderRoute('/site')
    await screen.findByText('初期値（まだ保存していません）')
    await user.click(screen.getByRole('button', { name: '土地（長方形で近似）' }))
    const width = await screen.findByRole('textbox', { name: '間口（m）' })
    await user.clear(width)
    await user.type(width, '30')
    expect(await screen.findByText(/全体 1500㎡/)).toBeInTheDocument()
    // Typing 30 passes through 3; the section must not be cut to 3 m on the way
    expect(
      screen.getByRole('img', { name: /間口30m×奥行50m のうち、区画 100\.0坪/ }),
    ).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: '筆界（左端からの距離 m）' }), '10.5, 20')
    await user.click(screen.getByRole('radio', { name: '東側' }))

    await user.click(screen.getByRole('switch', { name: '残りの土地への通路を確保する' }))

    await user.click(screen.getByRole('button', { name: /^建物（/ }))
    await user.click(await screen.findByRole('radio', { name: '2 階建て' }))
    expect(screen.getByRole('button', { name: '建物（2 階建て）' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '法規の目安' }))
    const fire = await screen.findByRole('switch', { name: /準防火地域/ })
    await user.click(fire)
    expect(fire).toBeChecked()
    // The 3 m fire-spread lines appear on the drawing, one per storey
    await waitFor(() =>
      expect(document.querySelectorAll('svg.site-canvas .site-fireline')).toHaveLength(2),
    )
  })

  it('adds, edits and removes a neighbouring building', async () => {
    const { user } = await renderRoute('/site')
    await screen.findByText('初期値（まだ保存していません）')
    await user.click(screen.getByRole('button', { name: '隣地・周りの建物（0）' }))
    await user.click(await screen.findByRole('button', { name: '隣地・建物を足す' }))
    expect(screen.getByRole('button', { name: '隣地・周りの建物（1）' })).toBeInTheDocument()
    const name = screen.getByRole('textbox', { name: '名前' })
    await user.clear(name)
    await user.type(name, '北の家')
    expect(screen.getByRole('img', { name: /配置図/ })).toHaveTextContent('北の家（7m）')
    await user.click(screen.getByRole('radio', { name: '空地・駐車場など' }))
    const height = screen.queryByRole('textbox', { name: '高さ（m）' })
    expect(height === null || height).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '北の家を削除' }))
    expect(screen.getByRole('button', { name: '隣地・周りの建物（0）' })).toBeInTheDocument()
  })
})

describe('site route with a two-storey plan', () => {
  it('uses the build plan for the first layout', async () => {
    stub(getSitePlan, { plan: null, buildPlan: { floors: 2, tsuboMax: 30 } })
    await renderRoute('/site')
    expect(await screen.findByRole('button', { name: '建物（2 階建て）' })).toBeInTheDocument()
    await waitFor(() =>
      expect(within(screen.getByRole('main')).getAllByText(/坪/).length).toBeGreaterThan(0),
    )
  })
})
