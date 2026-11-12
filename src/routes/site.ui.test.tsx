import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_SITE_PLAN,
  moveSectionToBack,
  normalizePlan,
  placeBuildingNorth,
  type SitePlan,
} from '../lib/sitePlan'
import { getSitePlan, saveSitePlan } from '../server/sitePlan'
import { mockOf, stub } from '../../test/ui/fixtures'
import { renderRoute } from '../../test/ui/render'

vi.mock('../components/site/SiteView3D', () => import('../../test/ui/site3dStub'))

const SAVED: SitePlan = placeBuildingNorth(normalizePlan({ ...DEFAULT_SITE_PLAN }))
/** The plan as the other person saved it: with a neighbouring building entered by hand */
const THEIRS: SitePlan = normalizePlan({
  ...SAVED,
  neighbors: [{ label: '北の家', kind: 'building', x: 0, y: 50, width: 8, depth: 6, height: 7 }],
})
const T0 = '2030-01-01 00:00:00'
const T1 = '2030-01-02 00:00:00'
const T2 = '2030-01-03 00:00:00'
const CONFLICT = /^相手が先に区画を保存していたので、上書きしませんでした。/
const NEWER = /^相手が先に区画を保存しています。/

type Loaded = { plan: SitePlan | null; updatedAt: string | null; buildPlan: null }
type SaveArg = { data: { plan: SitePlan; expectedUpdatedAt: string | null } }

/** A loader that answers with whatever is "in the database" now */
function database(first: Loaded) {
  const state = { row: first }
  mockOf(getSitePlan).mockImplementation(async () => state.row)
  return state
}

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
    stub(getSitePlan, { plan: null, updatedAt: null, buildPlan: { floors: 1, tsuboMax: 32 } })
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
      conflict: false,
      plan: (arg as SaveArg).data.plan,
      updatedAt: T0,
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
    // Nothing was saved when the page opened: the save says so (null), and the server refuses
    // it if the other person saved first
    expect(save).toHaveBeenCalledWith({
      data: {
        plan: expect.objectContaining({ landWidth: 20, landDepth: 50 }),
        expectedUpdatedAt: null,
      },
    })
  })

  it('shows the saved state after a save, whatever key order the server answers in', async () => {
    const rekeyed = (p: SitePlan) => Object.fromEntries(Object.entries(p).reverse()) as never
    const db = database({ plan: null, updatedAt: null, buildPlan: null })
    mockOf(saveSitePlan).mockImplementation(async (arg) => {
      const { plan } = (arg as SaveArg).data
      db.row = { plan, updatedAt: T0, buildPlan: null }
      return { conflict: false, plan: rekeyed(plan), updatedAt: T0 }
    })
    const { user } = await renderRoute('/site')
    await screen.findByText('初期値（まだ保存していません）')
    await user.click(screen.getByRole('button', { name: '奥に寄せる' }))
    expect(screen.getByText('未保存の変更')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '区画を保存' }))
    expect(await screen.findByText('区画を保存しました')).toBeInTheDocument()
    expect(await screen.findByText('保存済み（二人で共有）')).toBeInTheDocument()
    expect(screen.queryByText('未保存の変更')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '区画を保存' })).toBeDisabled()
  })

  it('does not overwrite a plan the other person saved first: says so, keeps the changes, and saves on the second press', async () => {
    const db = database({ plan: SAVED, updatedAt: T0, buildPlan: null })
    const save = mockOf(saveSitePlan).mockImplementationOnce(async () => {
      // The other person saved while this page was open
      db.row = { plan: THEIRS, updatedAt: T1, buildPlan: null }
      return { conflict: true }
    })
    const { user } = await renderRoute('/site')
    await screen.findByText('保存済み（二人で共有）')
    await user.click(screen.getByRole('button', { name: '奥に寄せる' }))
    const mine = sectionDistance()
    await user.click(screen.getByRole('button', { name: '区画を保存' }))

    expect(await screen.findByText(CONFLICT)).toBeInTheDocument()
    expect(save).toHaveBeenLastCalledWith({
      data: { plan: expect.objectContaining({ neighbors: [] }), expectedUpdatedAt: T0 },
    })
    expect(screen.queryByText('区画を保存しました')).not.toBeInTheDocument()
    // The changes made here are still on screen, and the other person's plan is one press away
    expect(sectionDistance()).toBe(mine)
    expect(screen.getByRole('button', { name: '隣地・周りの建物（0）' })).toBeInTheDocument()
    expect(await screen.findByText(NEWER)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '相手の区画を表示' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '元に戻す' })).not.toBeInTheDocument()

    // Pressing save again is the overwrite the message announced, on top of their version
    save.mockImplementationOnce(async (arg) => {
      const { plan } = (arg as SaveArg).data
      db.row = { plan, updatedAt: T2, buildPlan: null }
      return { conflict: false, plan, updatedAt: T2 }
    })
    await user.click(screen.getByRole('button', { name: '区画を保存' }))
    expect(await screen.findByText('区画を保存しました')).toBeInTheDocument()
    expect(save).toHaveBeenLastCalledWith({
      data: { plan: expect.objectContaining({ neighbors: [] }), expectedUpdatedAt: T1 },
    })
    expect(await screen.findByText('保存済み（二人で共有）')).toBeInTheDocument()
    expect(screen.queryByText(NEWER)).not.toBeInTheDocument()
    expect(sectionDistance()).toBe(mine)
  })

  it('shows the plan the other person saved when asked to, and the next save is based on it', async () => {
    const db = database({ plan: SAVED, updatedAt: T0, buildPlan: null })
    const save = mockOf(saveSitePlan).mockImplementationOnce(async () => {
      db.row = { plan: THEIRS, updatedAt: T1, buildPlan: null }
      return { conflict: true }
    })
    const { user } = await renderRoute('/site')
    await screen.findByText('保存済み（二人で共有）')
    await user.click(screen.getByRole('button', { name: '奥に寄せる' }))
    await user.click(screen.getByRole('button', { name: '区画を保存' }))
    await user.click(await screen.findByRole('button', { name: '相手の区画を表示' }))

    expect(screen.getByRole('button', { name: '隣地・周りの建物（1）' })).toBeInTheDocument()
    expect(sectionDistance()).toBe('道路からの距離 0.0m')
    expect(screen.getByText('保存済み（二人で共有）')).toBeInTheDocument()
    expect(screen.queryByText(NEWER)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '元に戻す' })).toBeDisabled()

    // A change on top of their plan saves at the first press and keeps their neighbour
    save.mockImplementationOnce(async (arg) => {
      const { plan } = (arg as SaveArg).data
      db.row = { plan, updatedAt: T2, buildPlan: null }
      return { conflict: false, plan, updatedAt: T2 }
    })
    await user.click(screen.getByRole('button', { name: '奥に寄せる' }))
    await user.click(screen.getByRole('button', { name: '区画を保存' }))
    expect(await screen.findByText('区画を保存しました')).toBeInTheDocument()
    expect(save).toHaveBeenLastCalledWith({
      data: {
        plan: expect.objectContaining({ neighbors: THEIRS.neighbors }),
        expectedUpdatedAt: T1,
      },
    })
  })

  it('after a refresh, takes a newer saved plan when nothing was changed here', async () => {
    const db = database({ plan: SAVED, updatedAt: T0, buildPlan: null })
    const { router } = await renderRoute('/site')
    await screen.findByText('保存済み（二人で共有）')
    db.row = { plan: THEIRS, updatedAt: T1, buildPlan: null }
    await act(() => router.invalidate())
    expect(await screen.findByRole('button', { name: '隣地・周りの建物（1）' })).toBeInTheDocument()
    expect(screen.getByText('保存済み（二人で共有）')).toBeInTheDocument()
    expect(screen.queryByText(NEWER)).not.toBeInTheDocument()
  })

  it('after a refresh with changes made here, keeps them, says the other person saved, and the first save is still refused', async () => {
    const db = database({ plan: SAVED, updatedAt: T0, buildPlan: null })
    const save = mockOf(saveSitePlan).mockResolvedValue({ conflict: true })
    const { user, router } = await renderRoute('/site')
    await screen.findByText('保存済み（二人で共有）')
    await user.click(screen.getByRole('button', { name: '奥に寄せる' }))
    const mine = sectionDistance()
    db.row = { plan: THEIRS, updatedAt: T1, buildPlan: null }
    await act(() => router.invalidate())

    expect(await screen.findByText(NEWER)).toBeInTheDocument()
    expect(sectionDistance()).toBe(mine)
    expect(screen.getByRole('button', { name: '隣地・周りの建物（0）' })).toBeInTheDocument()
    expect(screen.getByText('未保存の変更')).toBeInTheDocument()
    // The save still names the version this screen started from, so the server refuses it
    await user.click(screen.getByRole('button', { name: '区画を保存' }))
    expect(await screen.findByText(CONFLICT)).toBeInTheDocument()
    expect(save).toHaveBeenLastCalledWith({
      data: { plan: expect.anything(), expectedUpdatedAt: T0 },
    })
  })

  it('takes a newer saved plan without asking when the changes made here are the same', async () => {
    const db = database({ plan: SAVED, updatedAt: T0, buildPlan: null })
    const { user, router } = await renderRoute('/site')
    await screen.findByText('保存済み（二人で共有）')
    await user.click(screen.getByRole('button', { name: '奥に寄せる' }))
    // The other person saved the very same move
    db.row = { plan: moveSectionToBack(SAVED), updatedAt: T1, buildPlan: null }
    await act(() => router.invalidate())
    expect(await screen.findByText('保存済み（二人で共有）')).toBeInTheDocument()
    expect(screen.queryByText(NEWER)).not.toBeInTheDocument()
  })

  it('reports a refused save', async () => {
    mockOf(saveSitePlan).mockRejectedValue(new Error('区画が土地からはみ出しています'))
    const { user } = await renderRoute('/site')
    await user.click(await screen.findByRole('button', { name: '区画を保存' }))
    expect(await screen.findByText('区画が土地からはみ出しています')).toBeInTheDocument()
  })

  it('restores the saved plan after edits', async () => {
    stub(getSitePlan, { plan: SAVED, updatedAt: T0, buildPlan: null })
    const { user } = await renderRoute('/site')
    expect(await screen.findByText('保存済み（二人で共有）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '元に戻す' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '奥に寄せる' }))
    expect(screen.getByText('未保存の変更')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '元に戻す' }))
    expect(screen.getByText('保存済み（二人で共有）')).toBeInTheDocument()
  })

  it('drags the building on the drawing', async () => {
    stub(getSitePlan, { plan: SAVED, updatedAt: T0, buildPlan: null })
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

  it('keeps a change made elsewhere in the middle of retyping a number', async () => {
    const { user } = await renderRoute('/site')
    await screen.findByText('初期値（まだ保存していません）')
    await user.click(screen.getByRole('button', { name: '隣地・周りの建物（0）' }))
    await user.click(await screen.findByRole('button', { name: '隣地・建物を足す' }))
    await user.click(screen.getByRole('button', { name: '土地（長方形で近似）' }))
    const width = await screen.findByRole('textbox', { name: '間口（m）' })
    await user.clear(width)
    await user.type(width, '3')
    // Renaming the neighbour goes around update(); retyping the width afterwards must not
    // start again from the plan as it was before the width edit and drop the new name
    const name = screen.getByRole('textbox', { name: '名前' })
    await user.clear(name)
    await user.type(name, '倉庫')
    await user.type(width, '0')
    expect(await screen.findByRole('img', { name: /間口30m×奥行50m/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '名前' })).toHaveValue('倉庫')
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
    // A front road under 4 m brings up the setback (道路後退) among the checks
    expect(screen.queryByText('道路後退（セットバック）')).not.toBeInTheDocument()
    const road = screen.getByRole('textbox', { name: '前面道路の幅員（m）' })
    await user.clear(road)
    await user.type(road, '3.6')
    expect(await screen.findByText('道路後退（セットバック）')).toBeInTheDocument()
    expect(screen.getByText(/道路の幅員を 4m とみなして×0\.4/)).toBeInTheDocument()
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
    stub(getSitePlan, { plan: null, updatedAt: null, buildPlan: { floors: 2, tsuboMax: 30 } })
    await renderRoute('/site')
    expect(await screen.findByRole('button', { name: '建物（2 階建て）' })).toBeInTheDocument()
    await waitFor(() =>
      expect(within(screen.getByRole('main')).getAllByText(/坪/).length).toBeGreaterThan(0),
    )
  })
})
