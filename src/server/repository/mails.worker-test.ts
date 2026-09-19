import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { inboundMails, vendorNews } from '../../db/schema'
import { upsertVendor } from './candidates'
import {
  cleanupInboundMails,
  deleteInboundMail,
  getInboundMailBody,
  importMailAsNews,
  insertInboundMail,
  listInboundMails,
} from './mails'
import { actor, db, reset } from './test-helpers'

beforeEach(reset)

describe('inbound_mails', () => {
  it('テーブルと列がある', async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(inbound_mails)').all()
    const names = results.map((r) => (r as { name: string }).name)
    expect(names).toEqual(
      expect.arrayContaining(['message_id', 'status', 'body_text', 'vendor_id', 'news_id']),
    )
    const vn = await env.DB.prepare('PRAGMA table_info(vendor_news)').all()
    expect(vn.results.map((r) => (r as { name: string }).name)).toContain('mail_id')

    const fks = await env.DB.prepare('PRAGMA foreign_key_list(vendor_news)').all()
    const mailIdFk = fks.results.find((r) => (r as { from: string }).from === 'mail_id') as
      { on_delete: string } | undefined
    expect(mailIdFk?.on_delete).toBe('SET NULL')
  })
})

function row(over: Partial<Parameters<typeof insertInboundMail>[1]> = {}) {
  return {
    messageId: '<m1@example.com>',
    receivedAt: '2026-09-17T00:00:00.000Z',
    fromAddress: 'news@vendor.example',
    forwardedBy: 'owner@example.com',
    subject: '完成見学会のご案内',
    sentOn: '2026-09-16',
    bodyText: '9月27日(土) 完成見学会を開催します。',
    bodyTruncated: false,
    status: 'unassigned' as const,
    rejectReason: null,
    vendorId: null,
    newsId: null,
    ...over,
  }
}

describe('insertInboundMail', () => {
  it('入り、同じ message_id は created=false で既存 id を返す', async () => {
    const a = await insertInboundMail(db, row())
    const b = await insertInboundMail(db, row({ subject: '別件名' }))
    expect(a.created).toBe(true)
    expect(b).toEqual({ id: a.id, created: false })
    const rows = await db.select().from(inboundMails)
    expect(rows).toHaveLength(1)
    expect(rows[0].subject).toBe('完成見学会のご案内')
  })
})

describe('importMailAsNews', () => {
  it('お知らせ行を作って imported にし、日程も付く', async () => {
    const vendorId = await upsertVendor(
      db,
      { name: 'テスト工務店', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    const { id } = await insertInboundMail(db, row())
    const { newsId } = await importMailAsNews(db, id, vendorId, '2026-09-17')
    expect(newsId).not.toBeNull()
    const [news] = await db.select().from(vendorNews).where(eq(vendorNews.id, newsId!))
    expect(news.url).toBe('mail:<m1@example.com>')
    expect(news.mailId).toBe(id)
    expect(news.publishedOn).toBe('2026-09-16')
    expect(news.eventStart).toBe('2026-09-27')
    const [mail] = await db.select().from(inboundMails).where(eq(inboundMails.id, id))
    expect(mail.status).toBe('imported')
    expect(mail.vendorId).toBe(vendorId)
    expect(mail.newsId).toBe(newsId)
  })
  it('2 回目は url 重複で作らず newsId は最初のまま', async () => {
    const vendorId = await upsertVendor(
      db,
      { name: 'テスト工務店', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    const { id } = await insertInboundMail(db, row())
    const first = await importMailAsNews(db, id, vendorId, '2026-09-17')
    const second = await importMailAsNews(db, id, vendorId, '2026-09-17')
    expect(second.newsId).toBe(first.newsId)
    expect(await db.select().from(vendorNews)).toHaveLength(1)
  })
})

describe('listInboundMails / getInboundMailBody / deleteInboundMail / cleanupInboundMails', () => {
  it('新しい順・status 絞り込み・本文取得・削除', async () => {
    await insertInboundMail(db, row({ messageId: '<a>', receivedAt: '2026-09-01T00:00:00.000Z' }))
    const { id: b } = await insertInboundMail(
      db,
      row({
        messageId: '<b>',
        receivedAt: '2026-09-02T00:00:00.000Z',
        status: 'rejected',
        bodyText: null,
      }),
    )
    const all = await listInboundMails(db, { limit: 10 })
    expect(all.map((m) => m.messageId)).toEqual(['<b>', '<a>'])
    expect(await listInboundMails(db, { status: 'unassigned', limit: 10 })).toHaveLength(1)
    expect(await getInboundMailBody(db, all[1].id)).toBe('9月27日(土) 完成見学会を開催します。')
    expect(await getInboundMailBody(db, 'nope')).toBeNull()
    await deleteInboundMail(db, b)
    expect(await listInboundMails(db, { limit: 10 })).toHaveLength(1)
  })
  it('掃除は rejected/system の古い行だけ消す', async () => {
    await insertInboundMail(
      db,
      row({ messageId: '<old-rej>', receivedAt: '2026-01-01T00:00:00.000Z', status: 'rejected' }),
    )
    await insertInboundMail(
      db,
      row({ messageId: '<old-sys>', receivedAt: '2026-01-01T00:00:00.000Z', status: 'system' }),
    )
    await insertInboundMail(
      db,
      row({ messageId: '<old-un>', receivedAt: '2026-01-01T00:00:00.000Z', status: 'unassigned' }),
    )
    await insertInboundMail(
      db,
      row({ messageId: '<new-rej>', receivedAt: '2026-09-10T00:00:00.000Z', status: 'rejected' }),
    )
    const removed = await cleanupInboundMails(db, '2026-08-20T00:00:00.000Z')
    expect(removed).toBe(2)
    const left = (await listInboundMails(db, { limit: 10 })).map((m) => m.messageId).sort()
    expect(left).toEqual(['<new-rej>', '<old-un>'])
  })
})
