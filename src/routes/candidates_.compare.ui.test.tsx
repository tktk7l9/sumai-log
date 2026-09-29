import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { listCandidates } from '../server/candidates'
import { getBuildPlan } from '../server/research'
import { stub, uid, vendor } from '../../test/ui/fixtures'
import { renderRoute } from '../../test/ui/render'

function row(over: Parameters<typeof vendor>[0], coversHome = false) {
  return { ...vendor(over), coversHome, placeCount: 0 }
}

const VENDORS = [
  row(
    {
      id: uid(1),
      name: 'エー工務店',
      uaValue: 0.34,
      pricePerTsuboMin: 80,
      pricePerTsuboMax: 100,
      serviceAreas: ['テスト市'],
      research: {
        version: 1,
        researchedOn: '2026-09-10',
        summary: '断熱に強い',
        facts: { insulation: 'G3' },
        sections: [],
        sources: [],
      },
    },
    true,
  ),
  row({ id: uid(2), name: 'ビー工務店', hq: null }),
  row({ id: uid(3), name: 'シー工務店', status: 'dropped' }),
]

function table() {
  return screen.getByRole('table')
}

describe('compare route', () => {
  beforeEach(() => {
    stub(listCandidates, { homeAreas: [], vendors: VENDORS, properties: [] })
    stub(getBuildPlan, { plan: { floors: 2, tsuboMin: 30, tsuboMax: 30, budgetManYen: null } })
  })

  it('lays out vendors as columns with only the rows someone has a value for', async () => {
    await renderRoute('/candidates/compare')
    expect(await screen.findByRole('heading', { level: 1, name: '候補の比較' })).toBeInTheDocument()
    expect(screen.getByText(/建築計画: 2 階建て 30坪。目安は/)).toBeInTheDocument()
    const t = table()
    expect(within(t).getByRole('columnheader', { name: /エー工務店/ })).toBeInTheDocument()
    expect(within(t).getByRole('columnheader', { name: /ビー工務店/ })).toBeInTheDocument()
    // Dropped vendors are hidden until the switch is turned on
    expect(within(t).queryByText('シー工務店')).not.toBeInTheDocument()
    expect(within(t).getByRole('rowheader', { name: 'UA値' })).toBeInTheDocument()
    expect(within(t).getByRole('rowheader', { name: '断熱' })).toBeInTheDocument()
    // Nobody has a seismic grade, so that row is left out
    expect(within(t).queryByRole('rowheader', { name: '耐震等級' })).not.toBeInTheDocument()
    expect(within(t).getByText('断熱に強い')).toBeInTheDocument()
    expect(within(t).getByText('建築予定地が施工エリア内')).toBeInTheDocument()
    expect(within(t).getByText('未登録')).toBeInTheDocument()
    expect(within(t).getByText('未調査')).toBeInTheDocument()
    expect(within(t).getByText('2026/09/10')).toBeInTheDocument()
    expect(within(t).getByText('総額 3,429〜4,286万円')).toBeInTheDocument()
    expect(within(t).getByText('坪単価が未登録')).toBeInTheDocument()
  })

  it('shows dropped vendors on request', async () => {
    const { user } = await renderRoute('/candidates/compare')
    await user.click(await screen.findByRole('switch', { name: '見送りも表示（1）' }))
    expect(within(table()).getByText('シー工務店')).toBeInTheDocument()
  })

  it('hides a vendor through the URL and brings it back', async () => {
    const { user, router } = await renderRoute('/candidates/compare')
    await user.click(await screen.findByRole('button', { name: 'エー工務店 を比較から隠す' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ h: uid(1) }))
    expect(within(table()).queryByText('エー工務店')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ビー工務店 を比較から隠す' }))
    expect(
      await screen.findByText('表示中の業者がありません。上のチップやスイッチから戻せます。'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'エー工務店 を表示する' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'すべて表示' }))
    await waitFor(() => expect(within(table()).getByText('ビー工務店')).toBeInTheDocument())
  })

  it('invites to register vendors and a plan when there is nothing', async () => {
    stub(listCandidates, { homeAreas: [], vendors: [], properties: [] })
    stub(getBuildPlan, { plan: null })
    await renderRoute('/candidates/compare')
    expect(
      await screen.findByText(/設定で建築計画（階数・坪数・予算）を登録すると/),
    ).toBeInTheDocument()
    expect(
      screen.getByText('比べる業者がありません。候補から業者を登録してください。'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})
