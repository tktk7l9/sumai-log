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
  LIST_BODY_PREVIEW_CHARS,
  listInboundMails,
  reviveRejectedInboundMail,
} from './mails'
import { actor, db, reset } from './test-helpers'

beforeEach(reset)

describe('inbound_mails', () => {
  it('the table and columns exist', async () => {
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
  it('inserts, and the same message_id returns the existing id with created=false', async () => {
    const a = await insertInboundMail(db, row())
    const b = await insertInboundMail(db, row({ subject: '別件名' }))
    expect(a.created).toBe(true)
    expect(a.existingStatus).toBeNull()
    expect(b).toEqual({ id: a.id, created: false, existingStatus: 'unassigned' })
    const rows = await db.select().from(inboundMails)
    expect(rows).toHaveLength(1)
    expect(rows[0].subject).toBe('完成見学会のご案内')
  })

  it('existingStatus is rejected when the existing row is already rejected', async () => {
    await insertInboundMail(
      db,
      row({
        status: 'rejected',
        rejectReason: 'not forwarded by owner',
        bodyText: null,
        forwardedBy: null,
      }),
    )
    const b = await insertInboundMail(db, row())
    expect(b.created).toBe(false)
    expect(b.existingStatus).toBe('rejected')
  })
})

describe('reviveRejectedInboundMail', () => {
  it('overwrites a reject row with the new content and puts it back to unassigned. Does not touch news_id', async () => {
    const { id } = await insertInboundMail(
      db,
      row({
        status: 'rejected',
        rejectReason: 'not forwarded by owner',
        bodyText: null,
        forwardedBy: null,
      }),
    )
    await reviveRejectedInboundMail(
      db,
      id,
      row({
        receivedAt: '2026-09-18T00:00:00.000Z',
        forwardedBy: 'owner@example.com',
        bodyText: '復活後の本文',
      }),
    )
    const [mail] = await db.select().from(inboundMails).where(eq(inboundMails.id, id))
    expect(mail.status).toBe('unassigned')
    expect(mail.rejectReason).toBeNull()
    expect(mail.bodyText).toBe('復活後の本文')
    expect(mail.forwardedBy).toBe('owner@example.com')
    expect(mail.receivedAt).toBe('2026-09-18T00:00:00.000Z')
    expect(mail.newsId).toBeNull()
  })
})

describe('importMailAsNews', () => {
  it('creates a vendor news row, sets imported, and attaches the schedule too', async () => {
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
  it('the 2nd time does not create one because of the duplicate url, and newsId stays the first one', async () => {
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
  it('newest first, status filter, body fetch, delete', async () => {
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
    expect(all[1].bodyText).toBe('9月27日(土) 完成見学会を開催します。')
    expect(await listInboundMails(db, { status: 'unassigned', limit: 10 })).toHaveLength(1)
    expect(await getInboundMailBody(db, all[1].id)).toBe('9月27日(土) 完成見学会を開催します。')
    expect(await getInboundMailBody(db, 'nope')).toBeNull()
    await deleteInboundMail(db, b)
    expect(await listInboundMails(db, { limit: 10 })).toHaveLength(1)
  })
  it('lists a body preview only, except for system mail', async () => {
    const long = 'あ'.repeat(LIST_BODY_PREVIEW_CHARS + 50)
    await insertInboundMail(
      db,
      row({ messageId: '<long>', receivedAt: '2026-09-03T00:00:00.000Z', bodyText: long }),
    )
    await insertInboundMail(
      db,
      row({
        messageId: '<sys>',
        receivedAt: '2026-09-04T00:00:00.000Z',
        status: 'system',
        bodyText: long,
      }),
    )
    const byId = new Map((await listInboundMails(db, { limit: 10 })).map((m) => [m.messageId, m]))
    expect(byId.get('<long>')?.bodyText).toBe('あ'.repeat(LIST_BODY_PREVIEW_CHARS))
    expect(byId.get('<sys>')?.bodyText).toBe(long)
    // The full text is still there
    expect(await getInboundMailBody(db, byId.get('<long>')!.id)).toBe(long)
  })
  it('cleanup deletes only old rejected/system rows', async () => {
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
