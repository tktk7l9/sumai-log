import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GLOSSARY } from '../content/glossary'
import { analyzeRecords, type AnalysisVisit } from '../lib/analysis'
import { getAnalysis } from '../server/analysis'
import { stub } from '../../test/ui/fixtures'
import { renderRoute } from '../../test/ui/render'

const TODAY = '2026-09-30'

function visit(over: Partial<AnalysisVisit>): AnalysisVisit {
  return {
    id: 'vi1',
    visitedOn: '2026-08-10',
    attendees: 'both',
    vendorId: 'v1',
    vendorName: 'テスト工務店',
    placeName: 'テスト展示場',
    propertyName: null,
    good: null,
    concerns: null,
    qa: null,
    nextActions: null,
    photoCount: 0,
    ...over,
  }
}

function analysisOf(input: Partial<Parameters<typeof analyzeRecords>[0]>) {
  return {
    today: TODAY,
    analysis: analyzeRecords({
      visits: [],
      videos: [],
      vendors: [],
      events: [],
      comments: [],
      terms: GLOSSARY,
      today: TODAY,
      ...input,
    }),
  }
}

describe('analysis route', () => {
  it('summarises the records, month by month and per vendor', async () => {
    stub(
      getAnalysis,
      analysisOf({
        visits: [
          visit({
            id: 'vi1',
            good: '断熱がしっかりしていて暖かい\n断熱の説明が丁寧',
            concerns: '収納が少ない',
            nextActions: '見積もりを依頼\n済 資料を読む',
            photoCount: 4,
          }),
          visit({ id: 'vi2', visitedOn: '2026-09-02', vendorId: null, vendorName: null }),
        ],
        videos: [
          {
            id: 'vd1',
            watchedOn: '2026-09-05',
            watchedBy: 'both',
            title: 'UA値の話',
            channel: 'テストチャンネル',
            tags: ['断熱'],
            takeaways: null,
            vendorId: 'v1',
          },
        ],
        vendors: [
          { id: 'v1', name: 'テスト工務店', status: 'shortlisted' },
          { id: 'v2', name: 'サンプルハウス', status: 'interested' },
        ],
        events: [{ id: 'e1', startsAt: '2026-10-10T10:00:00+09:00', vendorId: 'v1' }],
        comments: [{ targetType: 'vendor', targetId: 'v1', body: 'C値も聞く' }],
      }),
    )
    const { user } = await renderRoute('/analysis')
    expect(await screen.findByRole('heading', { level: 1, name: '記録の分析' })).toBeInTheDocument()
    const visitsTile = screen.getByText('写真 4枚').parentElement!
    expect(within(visitsTile).getByText('2件')).toBeInTheDocument()
    expect(screen.getByText('2026/08/10')).toBeInTheDocument()

    // Records with empty bodies are listed with links to finish them
    expect(screen.getByRole('link', { name: /テスト展示場/ })).toHaveAttribute(
      'href',
      '/records/visits/vi2',
    )
    expect(screen.getByRole('link', { name: 'UA値の話' })).toHaveAttribute(
      'href',
      '/records/videos/vd1',
    )

    const chart = screen.getByRole('img', { name: /月ごとの見学と動画の件数/ })
    expect(chart).toHaveAccessibleName(/2026\/09 見学1件・動画1件/)
    fireEvent.click(chart.querySelectorAll(':scope > g')[1]!)
    expect(screen.getByText('2026/09：見学 1 件・動画 1 件')).toBeInTheDocument()
    fireEvent.pointerLeave(chart)
    expect(screen.getByText('棒に触れるとその月の内訳を出します')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '表で見る' }))
    expect(screen.getByRole('cell', { name: '2026/08' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'グラフで見る' }))

    const vendorTable = screen.getByRole('columnheader', { name: '最後の接点' }).closest('table')!
    expect(within(vendorTable).getByRole('link', { name: 'テスト工務店' })).toHaveAttribute(
      'href',
      '/candidates/vendors/v1',
    )
    expect(within(vendorTable).getByText('＋これから1')).toBeInTheDocument()
    expect(within(vendorTable).getByText('まだなし')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'UA値（外皮平均熱貫流率）' })).toHaveAttribute(
      'href',
      '/glossary/ua-value',
    )
    expect(screen.getByText('見積もりを依頼')).toBeInTheDocument()
    expect(screen.queryByText('資料を読む')).not.toBeInTheDocument()
    expect(screen.getByText('テストチャンネル')).toBeInTheDocument()
  })

  it('says what will appear once there are records', async () => {
    stub(getAnalysis, analysisOf({}))
    await renderRoute('/analysis')
    expect(await screen.findByText('記録なし')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '書きかけの記録' })).not.toBeInTheDocument()
    expect(screen.getByText('まだ日付のある記録がありません。')).toBeInTheDocument()
    expect(screen.getByText('候補に業者がまだありません。')).toBeInTheDocument()
    expect(screen.getByText('用語集の用語はまだ記録に出てきていません。')).toBeInTheDocument()
    expect(screen.getByText('未完了の「次にやること」はありません。')).toBeInTheDocument()
    expect(screen.getByText('動画にタグがまだありません。')).toBeInTheDocument()
  })

  it('shows only the first few unfinished records', async () => {
    const visits = Array.from({ length: 7 }, (_, i) =>
      visit({ id: `vi${i}`, visitedOn: `2026-09-0${i + 1}` }),
    )
    stub(getAnalysis, analysisOf({ visits }))
    await renderRoute('/analysis')
    expect(await screen.findByText('ほか 2 件')).toBeInTheDocument()
    expect(screen.getByText('よかった点・気になる点などが空の見学（7件）')).toBeInTheDocument()
  })
})
