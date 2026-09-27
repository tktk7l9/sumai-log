import { beforeEach, describe, expect, it } from 'vitest'

import { inboundMails, vendorNews } from '../db/schema'
import { upsertVendor } from './repository/candidates'
import { actor, db, reset } from './repository/test-helpers'
import { handleInboundMail, type InboundMessage } from './mailHandler'

beforeEach(reset)

const allow = ['owner@example.com', 'partner@example.com']
const NOW = '2026-09-17T01:00:00.000Z'

/**
 * A stand-in for ForwardableEmailMessage. Records calls of setReject in state.rejected.
 * `from` is the envelope sender verified by Email Routing (trustworthy). The default is the
 * shape of an envelope rewritten by Gmail auto-forwarding (the caf_ form of owner@example.com).
 */
function msg(raw: string, over: Partial<InboundMessage> = {}) {
  const state = { rejected: null as string | null }
  const message: InboundMessage = {
    from: 'owner+caf_=news=sumai.example@example.com',
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
  it('auto forward + vendor match -> imported (gets a vendor news row and dates)', async () => {
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

  it('auto forward + no vendor match -> unassigned (the body is saved)', async () => {
    await vendor('other.example')
    const r = await handleInboundMail(msg(AUTO).message, db, allow, NOW)
    expect(r.status).toBe('unassigned')
    const [mail] = await db.select().from(inboundMails)
    expect(mail.status).toBe('unassigned')
    expect(mail.bodyText).toContain('完成見学会')
    expect(await db.select().from(vendorNews)).toHaveLength(0)
  })

  it('turns the body into text and saves it even for an HTML-only mail', async () => {
    const vendorId = await vendor('vendor.example')
    const raw = [
      'Message-ID: <html1@vendor.example>',
      'From: Test Builder <news@vendor.example>',
      'Date: Wed, 16 Sep 2026 10:05:00 +0900',
      'Subject: 完成見学会のご案内',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<html><head><style>p{color:red}</style></head>',
      '<body><p>9月27日(土) <b>完成見学会</b>を開催します。</p></body></html>',
    ].join('\r\n')
    const r = await handleInboundMail(msg(raw).message, db, allow, NOW)
    expect(r.status).toBe('imported')
    const [mail] = await db.select().from(inboundMails)
    expect(mail.vendorId).toBe(vendorId)
    // The contents of style are not output, tags are dropped and only the text remains
    expect(mail.bodyText).toBe('9月27日(土) 完成見学会を開催します。')
    expect(mail.bodyTruncated).toBe(false)
    const [news] = await db.select().from(vendorNews)
    expect(news.eventStart).toBe('2026-09-27')
  })

  it('returns duplicate when the same Message-ID is received 2 times', async () => {
    await vendor('vendor.example')
    await handleInboundMail(msg(AUTO).message, db, allow, NOW)
    const r = await handleInboundMail(msg(AUTO).message, db, allow, NOW)
    expect(r.status).toBe('duplicate')
    expect(await db.select().from(inboundMails)).toHaveLength(1)
  })

  it('returns rejected when the envelope sender is not in the allowlist, even with a forged X-Forwarded-For (the body is not saved)', async () => {
    // AUTO is used as is (the X-Forwarded-For header containing owner@example.com also stays
    // = forged). But the envelope (message.from, which Email Routing verifies) is the vendor's
    // own address and is not in the allowlist = this assumes an attack aimed directly at news@.
    const { message, state } = msg(AUTO, { from: 'news@vendor.example' })
    const r = await handleInboundMail(message, db, allow, NOW)
    expect(r.status).toBe('rejected')
    expect(state.rejected).toBe('envelope sender not allowed')
    const [mail] = await db.select().from(inboundMails)
    expect(mail.status).toBe('rejected')
    expect(mail.rejectReason).toBe('envelope sender not allowed')
    expect(mail.bodyText).toBeNull()
  })

  it('revives the row with the same Message-ID to imported when it is forwarded correctly after a reject', async () => {
    const vendorId = await vendor('vendor.example')
    const first = await handleInboundMail(
      msg(AUTO, { from: 'news@vendor.example' }).message,
      db,
      allow,
      NOW,
    )
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

  it('returns duplicate for the 2nd reject and adds no row', async () => {
    const { message: m1, state: s1 } = msg(AUTO, { from: 'news@vendor.example' })
    const first = await handleInboundMail(m1, db, allow, NOW)
    expect(first.status).toBe('rejected')
    expect(s1.rejected).toBe('envelope sender not allowed')

    const { message: m2, state: s2 } = msg(AUTO, { from: 'news@vendor.example' })
    const second = await handleInboundMail(m2, db, allow, NOW)
    expect(second.status).toBe('duplicate')
    expect(s2.rejected).toBe('envelope sender not allowed')

    expect(await db.select().from(inboundMails)).toHaveLength(1)
  })

  it('restores the original sender, date and subject from the forwarded block of a manual forward and matches on them', async () => {
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

  it('saves the Gmail forwarding confirmation as system together with the body and does not turn it into vendor news', async () => {
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

  it('returns rejected when the envelope is not google.com, even with From forged as the Gmail forwarding confirmation (the body is not saved)', async () => {
    const raw = [
      'Message-ID: <sys2@google.example>',
      'From: forwarding-noreply@google.com',
      'Subject: (#000000) 偽の確認メール',
      'Content-Type: text/plain; charset=utf-8',
      '',
      '確認コード: 000000',
    ].join('\r\n')
    const { message, state } = msg(raw, { from: 'attacker@evil.example' })
    const r = await handleInboundMail(message, db, allow, NOW)
    expect(r.status).toBe('rejected')
    expect(state.rejected).toBe('envelope sender not trusted')
    const [mail] = await db.select().from(inboundMails)
    expect(mail.status).toBe('rejected')
    expect(mail.rejectReason).toBe('envelope sender not trusted')
    expect(mail.bodyText).toBeNull()
  })

  it('rejects a mail that is too large without reading it and leaves no record', async () => {
    const { message, state } = msg(AUTO, { rawSize: 3_000_000 })
    const r = await handleInboundMail(message, db, allow, NOW)
    expect(r.status).toBe('too-large')
    expect(state.rejected).toBe('too large')
    expect(await db.select().from(inboundMails)).toHaveLength(0)
  })
})
