import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { comments, inboundMails, vendorNews, vendors } from '../../db/schema'
import { deleteVendorCascade, upsertVendor } from './candidates'
import { insertComment } from './comments'
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
import { insertNewsIfNew } from './news'
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
  it.each(['rejected', 'system'] as const)(
    'never turns a %s row into vendor news',
    async (status) => {
      const vendorId = await upsertVendor(
        db,
        { name: 'テスト工務店', kind: 'koumuten', serviceAreas: [] },
        actor,
      )
      const { id } = await insertInboundMail(db, row({ status }))
      const { newsId } = await importMailAsNews(db, id, vendorId, '2026-09-17')
      expect(newsId).toBeNull()
      expect(await db.select().from(vendorNews)).toHaveLength(0)
      const [mail] = await db.select().from(inboundMails).where(eq(inboundMails.id, id))
      expect(mail.status).toBe(status)
      expect(mail.vendorId).toBeNull()
    },
  )
  it("links to the news row of the chosen vendor, not to another vendor's row with the same url", async () => {
    const other = await upsertVendor(
      db,
      { name: 'テスト工務店A', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    const chosen = await upsertVendor(
      db,
      { name: 'テスト工務店B', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    await insertNewsIfNew(db, [
      { vendorId: other, url: 'mail:<m1@example.com>', title: '別業者', publishedOn: '2026-09-16' },
    ])
    const { id } = await insertInboundMail(db, row())
    const { newsId } = await importMailAsNews(db, id, chosen, '2026-09-17')
    const [news] = await db.select().from(vendorNews).where(eq(vendorNews.id, newsId!))
    expect(news.vendorId).toBe(chosen)
    expect(news.mailId).toBe(id)
    expect(await db.select().from(vendorNews)).toHaveLength(2)
  })
})

/** Makes every statement of the given kind on the table fail until the returned function is called */
async function failOn(event: 'UPDATE' | 'DELETE', table: string): Promise<() => Promise<void>> {
  await env.DB.exec(
    `CREATE TRIGGER test_fail BEFORE ${event} ON ${table} BEGIN SELECT RAISE(ABORT, 'test failure'); END`,
  )
  return async () => {
    await env.DB.exec('DROP TRIGGER test_fail')
  }
}

describe('importMailAsNews: one atomic unit', () => {
  it('leaves no newsletter behind when marking the mail imported fails', async () => {
    const vendorId = await upsertVendor(
      db,
      { name: 'テスト工務店', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    const { id } = await insertInboundMail(db, row())
    const restore = await failOn('UPDATE', 'inbound_mails')
    try {
      await expect(importMailAsNews(db, id, vendorId, '2026-09-17')).rejects.toThrow()
    } finally {
      await restore()
    }
    expect(await db.select().from(vendorNews)).toHaveLength(0)
    const [mail] = await db.select().from(inboundMails).where(eq(inboundMails.id, id))
    expect([mail.status, mail.newsId]).toEqual(['unassigned', null])

    // The next try imports it as usual
    const { newsId } = await importMailAsNews(db, id, vendorId, '2026-09-17')
    expect(newsId).not.toBeNull()
    expect(await db.select().from(vendorNews)).toHaveLength(1)
  })
})

describe('deleting the vendor of imported mails', () => {
  async function twoVendors() {
    const gone = await upsertVendor(
      db,
      { name: 'テスト工務店A', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    const kept = await upsertVendor(
      db,
      { name: 'テスト工務店B', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    return { gone, kept }
  }
  const mailOf = async (id: string) =>
    (await db.select().from(inboundMails).where(eq(inboundMails.id, id)))[0]!

  it('puts them back to unassigned, so they can be imported to another vendor', async () => {
    const { gone, kept } = await twoVendors()
    const { id } = await insertInboundMail(db, row())
    const other = await insertInboundMail(db, row({ messageId: '<m2@example.com>' }))
    await importMailAsNews(db, id, gone, '2026-09-17')
    const keptNews = await importMailAsNews(db, other.id, kept, '2026-09-17')

    await deleteVendorCascade(db, gone)

    const mail = await mailOf(id)
    expect([mail.status, mail.vendorId, mail.newsId]).toEqual(['unassigned', null, null])
    expect(mail.bodyText).toBe('9月27日(土) 完成見学会を開催します。')
    expect(
      (await listInboundMails(db, { status: 'unassigned', limit: 10 })).map((m) => m.id),
    ).toEqual([id])
    // The other vendor's mail is not touched
    const untouched = await mailOf(other.id)
    expect([untouched.status, untouched.vendorId, untouched.newsId]).toEqual([
      'imported',
      kept,
      keptNews.newsId,
    ])

    const again = await importMailAsNews(db, id, kept, '2026-09-18')
    expect(again.newsId).not.toBeNull()
    const [news] = await db.select().from(vendorNews).where(eq(vendorNews.id, again.newsId!))
    expect([news.vendorId, news.mailId, news.url]).toEqual([kept, id, 'mail:<m1@example.com>'])
    const imported = await mailOf(id)
    expect([imported.status, imported.vendorId, imported.newsId]).toEqual([
      'imported',
      kept,
      again.newsId,
    ])
  })

  it('deletes nothing and changes no mail when the delete of the vendor fails', async () => {
    const { gone } = await twoVendors()
    const { id } = await insertInboundMail(db, row())
    const { newsId } = await importMailAsNews(db, id, gone, '2026-09-17')
    await insertComment(db, { targetType: 'vendor', targetId: gone, body: '一言' }, actor)
    const restore = await failOn('DELETE', 'vendors')
    try {
      await expect(deleteVendorCascade(db, gone)).rejects.toThrow()
    } finally {
      await restore()
    }
    const mail = await mailOf(id)
    expect([mail.status, mail.vendorId, mail.newsId]).toEqual(['imported', gone, newsId])
    expect(await db.select().from(comments)).toHaveLength(1)
    expect(await db.select().from(vendors)).toHaveLength(2)
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
