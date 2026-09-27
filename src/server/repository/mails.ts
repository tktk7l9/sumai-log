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

/**
 * If message_id already exists, does nothing and returns the existing id (idempotent).
 * `existingStatus` is the status at that moment when an existing row was there (null if
 * none). The caller (handleInboundMail) looks at it and decides whether to "revive an
 * already rejected row with the content that was correctly forwarded later"
 * (reviveRejectedInboundMail) or to simply treat it as a "duplicate".
 *
 * When the SELECT right after a failed insert finds no row (someone deleted the
 * conflicting row in that gap), it does not throw and returns `existingStatus: null`.
 * The caller treats that as a "duplicate" and gets away with dropping just 1 mail (it can
 * be re-imported from the settings page. Throwing here would only turn into 1 log line in
 * server.ts and leave nothing behind).
 */
export async function insertInboundMail(
  db: Db,
  row: NewInbound,
): Promise<{ id: string; created: boolean; existingStatus: InboundStatus | null }> {
  const id = crypto.randomUUID()
  const inserted = await db
    .insert(inboundMails)
    .values({ ...row, id })
    .onConflictDoNothing({ target: inboundMails.messageId })
    .returning({ id: inboundMails.id })
  if (inserted.length > 0) return { id, created: true, existingStatus: null }
  const [existing] = await db
    .select({ id: inboundMails.id, status: inboundMails.status })
    .from(inboundMails)
    .where(eq(inboundMails.messageId, row.messageId))
    .limit(1)
  if (!existing) return { id, created: false, existingStatus: null }
  return { id: existing.id, created: false, existingStatus: existing.status }
}

/**
 * A row with the same message_id that first arrived directly from someone other than the
 * member and was rejected is overwritten with the content properly forwarded at a later
 * date and put back to unassigned (only for the auto/manual paths of handleInboundMail.
 * Gmail auto-forwarding keeps the original Message-ID, so the directly delivered reject
 * and the later correct forward compete for the same row). news_id is not touched
 * (a reject row always stays null. The caller calls importMailAsNews after this if needed).
 */
export async function reviveRejectedInboundMail(
  db: Db,
  id: string,
  row: NewInbound,
): Promise<void> {
  await db
    .update(inboundMails)
    .set({
      receivedAt: row.receivedAt,
      fromAddress: row.fromAddress,
      forwardedBy: row.forwardedBy,
      subject: row.subject,
      sentOn: row.sentOn,
      bodyText: row.bodyText,
      bodyTruncated: row.bodyTruncated,
      status: 'unassigned',
      rejectReason: null,
      vendorId: row.vendorId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(inboundMails.id, id))
}

/**
 * Converts an inbound mail into vendor news, puts it into vendor_news, and updates
 * inbound_mails to imported. This is the only place that sets inbound_mails to imported
 * and attaches newsId (handleInboundMail always inserts as unassigned). If the url
 * (mail:<messageId>) already exists, it does not create a new one and links to that id.
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

/** Deletes rows that are rejected / system and older than olderThanIso. Returns the count */
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
