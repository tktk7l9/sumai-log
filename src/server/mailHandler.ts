import { isNotNull } from 'drizzle-orm'
import PostalMime from 'postal-mime'

import type { Db } from '../db/client'
import { vendors } from '../db/schema'
import { toJstDateKey } from '../lib/jst'
import { splitForwardedBlock } from '../lib/mail/forwarded'
import { domainOf, matchVendorByDomain } from '../lib/mail/match'
import { extractBody, toParsedMail } from '../lib/mail/parse'
import { classifyRoute } from '../lib/mail/route'
import { MAX_INPUT_LENGTH } from '../lib/news/text'
import { importMailAsNews, insertInboundMail, reviveRejectedInboundMail } from './repository/mails'

/** The part of ForwardableEmailMessage that is used (tests pass a plain object) */
export type InboundMessage = {
  from: string
  to: string
  rawSize: number
  raw: ReadableStream<Uint8Array> | string | Uint8Array
  setReject(reason: string): void
}

export type HandleResult = {
  status: 'imported' | 'unassigned' | 'rejected' | 'system' | 'duplicate' | 'too-large'
  fromDomain: string | null
  subject: string
}

/**
 * Handles 1 mail delivered to news@ (design 2026-09-19 §3).
 * Read -> classify the route -> record in inbound_mails -> into vendor_news once the vendor
 * is decided. Exceptions are logged by the caller (server.ts). ctx.waitUntil is not used.
 *
 * Trust model (see src/lib/mail/route.ts): authorisation is done only with `message.from`
 * (the envelope sender passed by Cloudflare Email Routing). Headers (`From:` /
 * `X-Forwarded-For`) are part of the mail body and can be forged, so they are only passed as
 * the third argument of `classifyRoute` and are not used for authorisation.
 * Email Routing rejects mail that fails authentication according to the DMARC policy of the
 * sending domain, so the system route impersonating `google.com` (p=reject) is protected, but
 * `gmail.com` is p=none, so a forged envelope sender can pass through Routing. This is a
 * stronger check than headers but not complete (the mitigation is to make the forwarding
 * address a secret that cannot be guessed. SPF/ARC header verification is a follow-up).
 *
 * Because of this "anyone can send" assumption, **turning the body into text (heavy) happens
 * only after the route is accepted**: extractBody is not called for mail that is rejected
 * (HTML -> text is proportional to the input size).
 *
 * The auto/manual routes are always recorded with status: 'unassigned', and only when the
 * vendor is decided does importMailAsNews raise it to imported (even if turning it into
 * vendor news fails, the row stays unassigned, so it can be imported again from the settings
 * page. The half-done state of imported with no newsId is never created).
 *
 * Gmail auto-forwarding uses the Message-ID of the original mail as is, so a row that arrived
 * at news@ directly from someone other than the owner and was rejected, and the same mail
 * forwarded correctly at a later date, collide on message_id. Treating it plainly as a
 * duplicate would leave the rejected content (no body) with no way to recover it, so only a
 * row already rejected is overwritten with the new content by reviveRejectedInboundMail
 * before continuing (any other existing status is an ordinary duplicate).
 */
export async function handleInboundMail(
  message: InboundMessage,
  db: Db,
  allowlist: readonly string[],
  nowIso: string = new Date().toISOString(),
): Promise<HandleResult> {
  if (message.rawSize > MAX_INPUT_LENGTH) {
    message.setReject('too large')
    return { status: 'too-large', fromDomain: domainOf(message.from), subject: '' }
  }

  const email = await PostalMime.parse(message.raw)
  const parsed = await toParsedMail(email)
  const route = classifyRoute(parsed, allowlist, message.from)
  const receivedOn = toJstDateKey(nowIso)

  if (route.kind === 'rejected') {
    // setReject is always called (the delivery itself is not permitted). Even when the record
    // is a duplicate, the rejection notice itself is returned every time.
    message.setReject(route.reason)
    const { created } = await insertInboundMail(db, {
      messageId: parsed.messageId,
      receivedAt: nowIso,
      fromAddress: parsed.from,
      forwardedBy: null,
      subject: parsed.subject,
      sentOn: parsed.date ? toJstDateKey(parsed.date) : null,
      bodyText: null,
      bodyTruncated: false,
      status: 'rejected',
      rejectReason: route.reason,
      vendorId: null,
      newsId: null,
    })
    return {
      status: created ? 'rejected' : 'duplicate',
      fromDomain: domainOf(parsed.from),
      subject: parsed.subject,
    }
  }

  // From here on only accepted routes. Turning the body into text happens only after this
  // point (no heavy conversion runs for rejected mail. See the trust model in the function
  // comment).
  const body = extractBody(email)

  if (route.kind === 'system') {
    const { created } = await insertInboundMail(db, {
      messageId: parsed.messageId,
      receivedAt: nowIso,
      fromAddress: parsed.from,
      forwardedBy: null,
      subject: parsed.subject,
      sentOn: parsed.date ? toJstDateKey(parsed.date) : null,
      bodyText: body.text,
      bodyTruncated: body.truncated,
      status: 'system',
      rejectReason: null,
      vendorId: null,
      newsId: null,
    })
    return {
      status: created ? 'system' : 'duplicate',
      fromDomain: domainOf(parsed.from),
      subject: parsed.subject,
    }
  }

  // For a manual forward, the contents of the forwarded block are "the original mail"
  let fromAddress = parsed.from
  let subject = parsed.subject
  let sentOn = parsed.date ? toJstDateKey(parsed.date) : null
  let bodyText = body.text
  if (route.kind === 'manual') {
    const block = splitForwardedBlock(body.text)
    if (block) {
      fromAddress = block.from ?? fromAddress
      subject = block.subject ?? subject
      sentOn = block.date ?? sentOn
      bodyText = block.body
    }
  }

  const candidates = await db
    .select({ id: vendors.id, newsEmailDomain: vendors.newsEmailDomain })
    .from(vendors)
    .where(isNotNull(vendors.newsEmailDomain))
  const vendor = matchVendorByDomain(fromAddress, candidates)

  // Always inserted as unassigned. Only importMailAsNews raises it to imported and attaches
  // newsId (even on a failure midway the row stays unassigned and can be imported again from
  // the settings page).
  const row = {
    messageId: parsed.messageId,
    receivedAt: nowIso,
    fromAddress,
    forwardedBy: route.forwardedBy,
    subject,
    sentOn,
    bodyText,
    bodyTruncated: body.truncated,
    status: 'unassigned' as const,
    rejectReason: null,
    vendorId: vendor?.id ?? null,
    newsId: null,
  }
  const { id, created, existingStatus } = await insertInboundMail(db, row)
  const fromDomain = domainOf(fromAddress)

  if (!created) {
    if (existingStatus === 'rejected') {
      // Revive a row that arrived directly from someone other than the owner and was rejected,
      // using the correct forward that arrived later
      await reviveRejectedInboundMail(db, id, row)
    } else {
      return { status: 'duplicate', fromDomain, subject }
    }
  }

  if (!vendor) return { status: 'unassigned', fromDomain, subject }
  await importMailAsNews(db, id, vendor.id, receivedOn)
  return { status: 'imported', fromDomain, subject }
}
