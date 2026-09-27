/**
 * Inbound mail -> a vendor news (vendor_news) row (design 2026-09-19 §3-7). Uses the same event
 * date detection as RSS.
 */

import { extractEvent } from '../news/eventDate'
import { truncate } from '../news/text'

export const MAIL_URL_PREFIX = 'mail:'
const SUMMARY_MAX = 300
const TITLE_MAX = 300
const UNTITLED = '（件名なし）'

export function mailUrl(messageId: string): string {
  return `${MAIL_URL_PREFIX}${messageId}`
}

export function isMailNews(url: string): boolean {
  return url.startsWith(MAIL_URL_PREFIX)
}

export type InboundForNews = {
  messageId: string
  subject: string
  text: string
  /** YYYY-MM-DD or null */
  sentOn: string | null
}

export type NewsDraft = {
  vendorId: string
  url: string
  title: string
  summary: string | null
  publishedOn: string
  eventStart: string | null
  eventEnd: string | null
  eventKind: string | null
}

export function inboundToNews(
  mail: InboundForNews,
  vendorId: string,
  receivedOn: string,
): NewsDraft {
  const publishedOn = mail.sentOn ?? receivedOn
  const title = truncate(mail.subject.trim() || UNTITLED, TITLE_MAX)
  const summary = mail.text ? truncate(mail.text, SUMMARY_MAX) : null
  const event = extractEvent(`${mail.subject}\n${mail.text}`, publishedOn)
  return {
    vendorId,
    url: mailUrl(mail.messageId),
    title,
    summary,
    publishedOn,
    eventStart: event?.start ?? null,
    eventEnd: event?.end ?? null,
    eventKind: event?.kind ?? null,
  }
}
