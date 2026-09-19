import { and, desc, eq, inArray, lt } from 'drizzle-orm'

import type { Db } from '../../db/client'
import {
  inboundMails,
  vendorNews,
  type InboundMail,
  type InboundStatus,
  type NewInboundMail,
} from '../../db/schema'
import { inboundToNews } from '../../lib/mail/toNews'
import { insertNewsIfNew } from './news'

export type NewInbound = Omit<NewInboundMail, 'id' | 'createdAt' | 'updatedAt'>

/** message_id が既にあれば何もせず既存 id を返す（冪等） */
export async function insertInboundMail(
  db: Db,
  row: NewInbound,
): Promise<{ id: string; created: boolean }> {
  const id = crypto.randomUUID()
  const inserted = await db
    .insert(inboundMails)
    .values({ ...row, id })
    .onConflictDoNothing({ target: inboundMails.messageId })
    .returning({ id: inboundMails.id })
  if (inserted.length > 0) return { id, created: true }
  const [existing] = await db
    .select({ id: inboundMails.id })
    .from(inboundMails)
    .where(eq(inboundMails.messageId, row.messageId))
    .limit(1)
  return { id: existing.id, created: false }
}

/**
 * 受信メールをお知らせに変換して vendor_news に入れ、inbound_mails を imported に更新する。
 * url（mail:<messageId>）が既にあれば新しく作らず、その id に紐づける。
 */
export async function importMailAsNews(
  db: Db,
  mailId: string,
  vendorId: string,
  receivedOn: string,
): Promise<{ newsId: string | null }> {
  const [mail] = await db.select().from(inboundMails).where(eq(inboundMails.id, mailId)).limit(1)
  if (!mail) return { newsId: null }
  const draft = inboundToNews(
    {
      messageId: mail.messageId,
      subject: mail.subject,
      text: mail.bodyText ?? '',
      sentOn: mail.sentOn,
    },
    vendorId,
    receivedOn,
  )
  await insertNewsIfNew(db, [{ ...draft, mailId }])
  const [news] = await db
    .select({ id: vendorNews.id })
    .from(vendorNews)
    .where(eq(vendorNews.url, draft.url))
    .limit(1)
  const newsId = news?.id ?? null
  await db
    .update(inboundMails)
    .set({ status: 'imported', vendorId, newsId, updatedAt: new Date().toISOString() })
    .where(eq(inboundMails.id, mailId))
  return { newsId }
}

export async function listInboundMails(
  db: Db,
  opts: { status?: InboundStatus; limit: number },
): Promise<InboundMail[]> {
  return db
    .select()
    .from(inboundMails)
    .where(opts.status ? eq(inboundMails.status, opts.status) : undefined)
    .orderBy(desc(inboundMails.receivedAt))
    .limit(opts.limit)
}

export async function getInboundMailBody(db: Db, id: string): Promise<string | null> {
  const [row] = await db
    .select({ bodyText: inboundMails.bodyText })
    .from(inboundMails)
    .where(eq(inboundMails.id, id))
    .limit(1)
  return row?.bodyText ?? null
}

export async function deleteInboundMail(db: Db, id: string): Promise<void> {
  await db.delete(inboundMails).where(eq(inboundMails.id, id))
}

/** rejected / system で olderThanIso より古い行を消す。戻り値は件数 */
export async function cleanupInboundMails(db: Db, olderThanIso: string): Promise<number> {
  const removed = await db
    .delete(inboundMails)
    .where(
      and(
        inArray(inboundMails.status, ['rejected', 'system']),
        lt(inboundMails.receivedAt, olderThanIso),
      ),
    )
    .returning({ id: inboundMails.id })
  return removed.length
}
