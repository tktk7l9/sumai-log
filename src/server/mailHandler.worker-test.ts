import { beforeEach, describe, expect, it } from 'vitest'

import { inboundMails, vendorNews } from '../db/schema'
import { upsertVendor } from './repository/candidates'
import { actor, db, reset } from './repository/test-helpers'
import { handleInboundMail, type InboundMessage } from './mailHandler'

beforeEach(reset)

const allow = ['owner@example.com', 'partner@example.com']
const NOW = '2026-09-17T01:00:00.000Z'

/** ForwardableEmailMessage の代わり。setReject の呼び出しを state.rejected に記録する */
function msg(raw: string, over: Partial<InboundMessage> = {}) {
  const state = { rejected: null as string | null }
  const message: InboundMessage = {
    from: 'news@vendor.example',
    to: 'news@sumai.example',
    rawSize: raw.length,
    raw,
    setReject(reason: string) {
      state.rejected = reason
    },
    ...over,
  }
  return { message, state }
}

const AUTO = [
  'Message-ID: <auto1@vendor.example>',
  'From: Test Builder <news@vendor.example>',
  'To: owner@example.com',
  'X-Forwarded-For: owner@example.com news@sumai.example',
  'Date: Wed, 16 Sep 2026 10:05:00 +0900',
  'Subject: 完成見学会のご案内',
  'Content-Type: text/plain; charset=utf-8',
  '',
  '9月27日(土)・28日(日) 完成見学会を開催します。',
].join('\r\n')

async function vendor(domain: string | null) {
  return upsertVendor(
    db,
    { name: 'テスト工務店', kind: 'koumuten', serviceAreas: [], newsEmailDomain: domain },
    actor,
  )
}

describe('handleInboundMail', () => {
  it('自動転送 + 業者一致 → imported（お知らせ行と日程が付く）', async () => {
    const vendorId = await vendor('vendor.example')
    const r = await handleInboundMail(msg(AUTO).message, db, allow, NOW)
    expect(r.status).toBe('imported')
    expect(r.fromDomain).toBe('vendor.example')
    const [mail] = await db.select().from(inboundMails)
    expect(mail.status).toBe('imported')
    expect(mail.forwardedBy).toBe('owner@example.com')
    expect(mail.sentOn).toBe('2026-09-16')
    expect(mail.vendorId).toBe(vendorId)
    const [news] = await db.select().from(vendorNews)
    expect(news.url).toBe('mail:<auto1@vendor.example>')
    expect(news.eventStart).toBe('2026-09-27')
    expect(mail.newsId).toBe(news.id)
  })

  it('自動転送 + 業者不一致 → unassigned（本文は保存）', async () => {
    await vendor('other.example')
    const r = await handleInboundMail(msg(AUTO).message, db, allow, NOW)
    expect(r.status).toBe('unassigned')
    const [mail] = await db.select().from(inboundMails)
    expect(mail.status).toBe('unassigned')
    expect(mail.bodyText).toContain('完成見学会')
    expect(await db.select().from(vendorNews)).toHaveLength(0)
  })

  it('同じ Message-ID を 2 回受けたら duplicate', async () => {
    await vendor('vendor.example')
    await handleInboundMail(msg(AUTO).message, db, allow, NOW)
    const r = await handleInboundMail(msg(AUTO).message, db, allow, NOW)
    expect(r.status).toBe('duplicate')
    expect(await db.select().from(inboundMails)).toHaveLength(1)
  })

  it('経路が無ければ rejected（setReject し、本文は保存しない）', async () => {
    const raw = AUTO.replace('X-Forwarded-For: owner@example.com news@sumai.example\r\n', '')
    const { message, state } = msg(raw)
    const r = await handleInboundMail(message, db, allow, NOW)
    expect(r.status).toBe('rejected')
    expect(state.rejected).toBe('not forwarded by owner')
    const [mail] = await db.select().from(inboundMails)
    expect(mail.status).toBe('rejected')
    expect(mail.bodyText).toBeNull()
  })

  it('reject された後に正しく転送されると、同じ Message-ID の行が imported に生き返る', async () => {
    const vendorId = await vendor('vendor.example')
    const rejectedRaw = AUTO.replace(
      'X-Forwarded-For: owner@example.com news@sumai.example\r\n',
      '',
    )
    const first = await handleInboundMail(msg(rejectedRaw).message, db, allow, NOW)
    expect(first.status).toBe('rejected')

    const second = await handleInboundMail(msg(AUTO).message, db, allow, NOW)
    expect(second.status).toBe('imported')

    const rows = await db.select().from(inboundMails)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('imported')
    expect(rows[0].bodyText).toContain('完成見学会')
    expect(rows[0].forwardedBy).toBe('owner@example.com')
    expect(rows[0].vendorId).toBe(vendorId)
  })

  it('reject が 2 回目は duplicate になり、行は増えない', async () => {
    const rejectedRaw = AUTO.replace(
      'X-Forwarded-For: owner@example.com news@sumai.example\r\n',
      '',
    )
    const { message: m1, state: s1 } = msg(rejectedRaw)
    const first = await handleInboundMail(m1, db, allow, NOW)
    expect(first.status).toBe('rejected')
    expect(s1.rejected).toBe('not forwarded by owner')

    const { message: m2, state: s2 } = msg(rejectedRaw)
    const second = await handleInboundMail(m2, db, allow, NOW)
    expect(second.status).toBe('duplicate')
    expect(s2.rejected).toBe('not forwarded by owner')

    expect(await db.select().from(inboundMails)).toHaveLength(1)
  })

  it('手動転送は転送ブロックから元の差出人・日付・件名を復元して照合する', async () => {
    const vendorId = await vendor('vendor.example')
    const raw = [
      'Message-ID: <fwd1@mail.example>',
      'From: Owner <partner@example.com>',
      'To: news@sumai.example',
      'Date: Thu, 17 Sep 2026 09:00:00 +0900',
      'Subject: Fwd: 構造見学会',
      'Content-Type: text/plain; charset=utf-8',
      '',
      '---------- Forwarded message ---------',
      'From: Test Builder <info@vendor.example>',
      'Date: 2026年9月10日(木) 12:00',
      'Subject: 構造見学会のお知らせ',
      'To: <partner@example.com>',
      '',
      '10月4日(日) 構造見学会。',
    ].join('\r\n')
    const r = await handleInboundMail(
      msg(raw, { from: 'partner@example.com' }).message,
      db,
      allow,
      NOW,
    )
    expect(r.status).toBe('imported')
    const [mail] = await db.select().from(inboundMails)
    expect(mail.fromAddress).toBe('info@vendor.example')
    expect(mail.forwardedBy).toBe('partner@example.com')
    expect(mail.subject).toBe('構造見学会のお知らせ')
    expect(mail.sentOn).toBe('2026-09-10')
    expect(mail.bodyText).toBe('10月4日(日) 構造見学会。')
    expect(mail.vendorId).toBe(vendorId)
  })

  it('Gmail の転送先確認は system として本文ごと保存し、お知らせにはしない', async () => {
    const raw = [
      'Message-ID: <sys1@google.example>',
      'From: forwarding-noreply@google.com',
      'Subject: (#123456) Gmail の転送の確認',
      'Content-Type: text/plain; charset=utf-8',
      '',
      '確認コード: 123456',
    ].join('\r\n')
    const r = await handleInboundMail(
      msg(raw, { from: 'forwarding-noreply@google.com' }).message,
      db,
      allow,
      NOW,
    )
    expect(r.status).toBe('system')
    const [mail] = await db.select().from(inboundMails)
    expect(mail.bodyText).toContain('123456')
    expect(await db.select().from(vendorNews)).toHaveLength(0)
  })

  it('大きすぎるメールは読まずに拒否し、記録も残さない', async () => {
    const { message, state } = msg(AUTO, { rawSize: 3_000_000 })
    const r = await handleInboundMail(message, db, allow, NOW)
    expect(r.status).toBe('too-large')
    expect(state.rejected).toBe('too large')
    expect(await db.select().from(inboundMails)).toHaveLength(0)
  })
})
