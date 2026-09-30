import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import type { InboundMail } from '../db/schema'
import { assignMail, deleteMail, listMailImport } from '../server/mails'
import { fetchNewsNow, newsSources, reparseNewsEvents } from '../server/news'
import { listLinkTargets } from '../server/places'
import { getBuildPlan, saveBuildPlan } from '../server/research'
import { getSettings } from '../server/settings'
import { listTagNames, saveTags } from '../server/tags'
import { faviconSources, refreshVendorFavicons } from '../server/vendorImages'
import { MEMBERS, mockOf, stub } from '../../test/ui/fixtures'
import { clearNotifications, renderRoute } from '../../test/ui/render'

function mail(over: Partial<InboundMail>): InboundMail {
  return {
    id: 'm1',
    messageId: '<m1@example.com>',
    receivedAt: '2026-09-20 01:00:00',
    fromAddress: 'info@example.com',
    forwardedBy: null,
    subject: '見学会のご案内',
    sentOn: null,
    bodyText: '週末に見学会を開きます',
    bodyTruncated: false,
    status: 'unassigned',
    rejectReason: null,
    vendorId: null,
    newsId: null,
    createdAt: '2026-09-20 01:00:00',
    updatedAt: '2026-09-20 01:00:00',
    ...over,
  }
}

const SETTINGS = {
  homeAreas: ['テスト市'],
  actorEmail: 'owner@example.com',
  members: MEMBERS,
  lastSeen: { 'owner@example.com': '2026-09-29 12:00:00' },
  environment: 'development',
  photosReady: true,
  usage: {
    d1: { bytes: 1_048_576, rows: { vendors: 3, visits: 12 } },
    r2: { count: 1200, bytes: 50_000_000, truncated: true },
  },
}

describe('settings route', () => {
  beforeEach(() => {
    stub(getSettings, SETTINGS)
    stub(listTagNames, ['断熱', '耐震'])
    stub(newsSources, {
      sources: [
        {
          id: 'v1',
          name: 'テスト工務店',
          newsUrl: 'https://example.com/a/very/long/path/to/the/news/feed/that/is/cut.xml',
          newsSource: 'rss',
          newsFetchedAt: '2026-09-29 21:00:00',
          newsFetchError: 'HTTP 403',
        },
        {
          id: 'v2',
          name: 'サンプルハウス',
          newsUrl: null,
          newsSource: null,
          newsFetchedAt: null,
          newsFetchError: null,
        },
      ],
    })
    stub(faviconSources, {
      vendors: [
        {
          id: 'v1',
          name: 'テスト工務店',
          websiteUrl: 'https://example.com/',
          newsUrl: 'https://example.com/feed',
          newsFetchError: 'HTTP 403',
          faviconKey: null,
        },
        {
          id: 'v2',
          name: 'サンプルハウス',
          websiteUrl: 'https://example.org/',
          newsUrl: null,
          newsFetchError: null,
          faviconKey: 'vendors/v2/favicon-1.png',
        },
      ],
    })
    stub(listMailImport, {
      inboxAddress: 'inbox@example.com',
      unassigned: [mail({ id: 'm1' })],
      recent: [
        mail({ id: 'm2', status: 'system', subject: '転送の確認', bodyText: '確認コード 123456' }),
        mail({ id: 'm3', status: 'imported', subject: '' }),
      ],
    })
    stub(listLinkTargets, { vendors: [{ id: 'v1', name: 'テスト工務店' }], properties: [] })
    stub(getBuildPlan, { plan: null })
  })

  it('shows members, environment and usage', async () => {
    await renderRoute('/settings')
    expect(await screen.findByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()
    expect(screen.getByText('あなた')).toBeInTheDocument()
    expect(screen.getByText('最後に使った: まだ記録なし')).toBeInTheDocument()
    expect(screen.getByText('development')).toBeInTheDocument()
    expect(screen.getByText('テスト市')).toBeInTheDocument()
    expect(screen.getByText('有効')).toBeInTheDocument()
    expect(screen.getByText(/^1(\.0)? MB（無料枠/)).toBeInTheDocument()
    expect(screen.getByText(/1,200\+ 個・/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '変更履歴を見る' })).toHaveAttribute(
      'href',
      '/changelog',
    )
  })

  it('says what is missing when members and usage are not available', async () => {
    stub(getSettings, {
      ...SETTINGS,
      members: [],
      homeAreas: [],
      photosReady: false,
      usage: { d1: { bytes: null, rows: {} }, r2: null },
    })
    await renderRoute('/settings')
    expect(await screen.findByText(/secret MEMBERS が未設定です/)).toBeInTheDocument()
    expect(screen.getByText('大きさは取れません')).toBeInTheDocument()
    expect(screen.getByText('なし')).toBeInTheDocument()
    expect(screen.getAllByText('未設定').length).toBeGreaterThanOrEqual(3)
  })

  it('switches the colour scheme', async () => {
    const { user } = await renderRoute('/settings')
    await user.click(await screen.findByRole('radio', { name: 'ダーク' }))
    expect(screen.getByRole('radio', { name: 'ダーク' })).toBeChecked()
  })

  it('saves the build plan after checking the range', async () => {
    const save = stub(saveBuildPlan, { ok: true })
    const { user } = await renderRoute('/settings')
    await user.click(await screen.findByRole('button', { name: '建築計画を保存' }))
    expect(await screen.findAllByText('坪数は必須です')).toHaveLength(2)

    await user.type(screen.getByRole('textbox', { name: '延床 下限（坪）' }), '32')
    await user.type(screen.getByRole('textbox', { name: '延床 上限（坪）' }), '28')
    await user.click(screen.getByRole('button', { name: '建築計画を保存' }))
    expect(await screen.findByText('下限≦上限にしてください')).toBeInTheDocument()

    await user.clear(screen.getByRole('textbox', { name: '延床 上限（坪）' }))
    await user.type(screen.getByRole('textbox', { name: '延床 上限（坪）' }), '35')
    await user.click(screen.getByRole('radio', { name: '2 階建て' }))
    await user.type(screen.getByRole('textbox', { name: '予算（万円・土地以外）' }), '3000')
    await user.click(screen.getByRole('button', { name: '建築計画を保存' }))
    expect(await screen.findByText('建築計画を保存しました')).toBeInTheDocument()
    expect(save).toHaveBeenCalledWith({
      data: { floors: 2, tsuboMin: 32, tsuboMax: 35, budgetManYen: 3000 },
    })
  })

  it('shows a saved plan and the server reason for a refused one', async () => {
    stub(getBuildPlan, { plan: { floors: 1, tsuboMin: 28, tsuboMax: 32, budgetManYen: null } })
    mockOf(saveBuildPlan).mockRejectedValue(new Error('坪数が大きすぎます'))
    const { user } = await renderRoute('/settings')
    expect(await screen.findByRole('textbox', { name: '延床 下限（坪）' })).toHaveValue('28')
    await user.click(screen.getByRole('button', { name: '建築計画を保存' }))
    expect(await screen.findByText('坪数が大きすぎます')).toBeInTheDocument()
  })

  it('saves tags but never an empty list', async () => {
    const save = stub(saveTags, { ok: true })
    const { user } = await renderRoute('/settings')
    const tags = await screen.findByLabelText('タグ', { selector: 'input' })
    await user.type(tags, '外構{Enter}')
    const card = screen
      .getByRole('heading', { name: 'タグ' })
      .closest('.mantine-Card-root') as HTMLElement
    await user.click(within(card).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('タグを保存しました')).toBeInTheDocument()
    expect(save).toHaveBeenCalledWith({ data: { names: ['断熱', '耐震', '外構'] } })

    mockOf(saveTags).mockRejectedValue(new Error('タグが多すぎます'))
    await user.click(within(card).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('タグが多すぎます')).toBeInTheDocument()

    for (let i = 0; i < 3; i += 1) await user.type(tags, '{Backspace}')
    await user.click(within(card).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('タグは 1 つ以上必要です')).toBeInTheDocument()
  })

  it('lists vendor news sources and explains a blocked site', async () => {
    await renderRoute('/settings')
    expect(await screen.findByText('https://example.com/a/very/long/path/to/…')).toBeInTheDocument()
    expect(screen.getByText('RSS')).toBeInTheDocument()
    expect(screen.getByText('方式未設定')).toBeInTheDocument()
    expect(screen.getByText('最終取得: 未取得')).toBeInTheDocument()
    expect(
      screen.getByText('サイト側が Cloudflare からのアクセスを拒否（HTTP 403）'),
    ).toBeInTheDocument()
    expect(screen.getByText(/このサイトはアイコンを自動取得できません/)).toBeInTheDocument()
    expect(screen.getByText('取得済み')).toBeInTheDocument()
  })

  it('fetches vendor news now and re-parses dates', async () => {
    stub(fetchNewsNow, {
      results: [
        { vendorId: 'v1', vendorName: 'テスト工務店', added: 2, error: null },
        { vendorId: 'v2', vendorName: '', added: 0, error: 'HTTP 500' },
      ],
    })
    stub(reparseNewsEvents, { checked: 10, updated: 3 })
    const { user } = await renderRoute('/settings')
    await user.click(await screen.findByRole('button', { name: '今すぐ取得' }))
    expect(await screen.findByText('テスト工務店: 追加 2 件')).toBeInTheDocument()
    expect(screen.getByText('不明な業者: エラー HTTP 500')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '日程を再解析' }))
    expect(await screen.findByText('10 件のうち 3 件の日程を更新しました')).toBeInTheDocument()

    clearNotifications()
    mockOf(fetchNewsNow).mockRejectedValue(new Error('時間切れ'))
    mockOf(reparseNewsEvents).mockRejectedValue(new Error('再解析に失敗'))
    await user.click(screen.getByRole('button', { name: '今すぐ取得' }))
    expect(await screen.findByText('時間切れ')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '日程を再解析' }))
    expect(await screen.findByText('再解析に失敗')).toBeInTheDocument()
  })

  it('refuses to fetch when no vendor has a news or website URL', async () => {
    stub(newsSources, { sources: [] })
    stub(faviconSources, { vendors: [] })
    const { user } = await renderRoute('/settings')
    expect(await screen.findByText(/お知らせ URL を設定した業者がありません/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '今すぐ取得' }))
    expect(await screen.findByText('お知らせ URL が設定された業者がありません')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'アイコンを取得' }))
    expect(
      await screen.findByText('公式サイトの URL が設定された業者がありません'),
    ).toBeInTheDocument()
  })

  it('fetches site icons in rounds', async () => {
    const refresh = stub(refreshVendorFavicons, {
      results: [
        { vendorId: 'v1', vendorName: 'テスト工務店', ok: false, error: 'HTTP 403' },
        { vendorId: 'v2', vendorName: 'サンプルハウス', ok: true },
      ],
      processed: 2,
      remaining: 4,
    })
    const { user } = await renderRoute('/settings')
    await user.click(await screen.findByRole('button', { name: 'アイコンを取得' }))
    expect(await screen.findByText('テスト工務店: エラー HTTP 403')).toBeInTheDocument()
    expect(screen.getByText('サンプルハウス: アイコンを取得しました')).toBeInTheDocument()
    expect(screen.getByText('残り 4 件（もう一度押してください）')).toBeInTheDocument()
    expect(refresh).toHaveBeenCalledWith({ data: { force: false } })

    clearNotifications()
    stub(refreshVendorFavicons, { results: [], processed: 0, remaining: 0 })
    await user.click(screen.getByRole('button', { name: 'アイコンを取得' }))
    expect(
      await screen.findByText('すべて取得済みです（「取り直す」で再取得できます）'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取り直す' }))
    expect(await screen.findByText('対象の業者がありません')).toBeInTheDocument()

    clearNotifications()
    mockOf(refreshVendorFavicons).mockRejectedValue(new Error('失敗しました'))
    await user.click(screen.getByRole('button', { name: '取り直す' }))
    expect(await screen.findByText('失敗しました')).toBeInTheDocument()
  })

  it('imports or deletes an unassigned mail and shows the system log', async () => {
    const assign = stub(assignMail, { ok: true })
    const remove = stub(deleteMail, { ok: true })
    const { user } = await renderRoute('/settings')
    expect(await screen.findByText('inbox@example.com')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '未割当 1 件' })).toBeInTheDocument()
    expect(screen.getByText('週末に見学会を開きます')).toBeInTheDocument()
    const importButton = screen.getByRole('button', { name: '取り込む' })
    expect(importButton).toBeDisabled()
    await user.click(screen.getByPlaceholderText('業者を選ぶ'))
    await user.click(await screen.findByRole('option', { name: 'テスト工務店' }))
    await user.click(importButton)
    expect(await screen.findByText('お知らせに取り込みました')).toBeInTheDocument()
    expect(assign).toHaveBeenCalledWith({ data: { mailId: 'm1', vendorId: 'v1' } })

    const mails = screen
      .getByRole('heading', { name: 'メール取込' })
      .closest('.mantine-Card-root') as HTMLElement
    await user.click(within(mails).getByRole('button', { name: '削除' }))
    expect(await screen.findByText('削除しました')).toBeInTheDocument()
    expect(remove).toHaveBeenCalledWith({ data: { id: 'm1' } })

    expect(screen.getByText('システム')).toBeInTheDocument()
    expect(screen.getByText(/（件名なし）/)).toBeInTheDocument()
    // The system mail (e.g. a forwarding confirmation code) is readable in place
    expect(screen.getByText('確認コード 123456')).toBeInTheDocument()

    mockOf(deleteMail).mockRejectedValue(new Error('消せませんでした'))
    await user.click(within(mails).getByRole('button', { name: '削除' }))
    expect(await screen.findByText('消せませんでした')).toBeInTheDocument()
  })

  it('says when there is no mail yet', async () => {
    stub(listMailImport, { inboxAddress: null, unassigned: [], recent: [] })
    await renderRoute('/settings')
    expect(await screen.findByText('業者に紐づかなかったメールはありません。')).toBeInTheDocument()
    expect(screen.getByText('まだ受信していません。')).toBeInTheDocument()
    expect(screen.getByText(/未設定（secret MAIL_INBOX_ADDRESS）/)).toBeInTheDocument()
  })
})
