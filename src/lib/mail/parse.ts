/**
 * Normalises the postal-mime parse result into the shape used for classification (ParsedMail)
 * (design 2026-09-19 §3-2, 3-6). postal-mime itself is not called here (the Worker and the
 * scripts call it and pass only the result), so this file can be tested with plain Node.
 */

import { MAX_INPUT_LENGTH, decodeEntities, truncate } from '../news/text'

export const MAX_BODY_CHARS = 100_000

/**
 * Upper limits of the stored subject and sender. Headers are kept as is even for `rejected`
 * (= anyone can send) rows, so a Subject of several hundred KB would by itself bloat the D1
 * row (rejected rows stay for 30 days). The display side also cuts the subject to 300
 * characters, so 500 is enough.
 * The address follows the RFC 5321 limits (path is 256, a practical address is 320).
 */
export const SUBJECT_MAX = 500
export const ADDRESS_MAX = 320

export type ParsedMail = {
  /** The Message-ID of the original mail (with <>). 'hash:<sha256>' when absent */
  messageId: string
  /** Lowercase address. '' when absent (cut at ADDRESS_MAX) */
  from: string
  /** Cut at SUBJECT_MAX */
  subject: string
  /** ISO-8601. null when absent */
  date: string | null
  /**
   * The body is not built in toParsedMail (always '' / false). The HTML -> text conversion
   * gets heavier in proportion to input size, and running it before authorisation would let
   * anyone use the Worker's CPU, so it is built separately by extractBody after the route is
   * accepted (see mailHandler).
   */
  text: string
  truncated: boolean
  /**
   * The X-Forwarded-For header split on whitespace and lowercased (added by Gmail
   * auto-forwarding)
   */
  forwardedFor: string[]
}

/** Only the parts of postal-mime's Email that are used */
export type RawParsed = {
  messageId?: string | null
  from?: { address?: string | null } | null
  subject?: string | null
  date?: string | null
  text?: string | null
  html?: string | null
  headers?: { key: string; value: string }[]
}

const BLOCK_END = /<\/(p|div|tr|li|h[1-6]|blockquote|table|section|article)\s*>/gi
const BR = /<br\s*\/?>/gi

/** Elements dropped together with their contents (case-insensitive) */
const DROP_BLOCK_TAGS = ['style', 'script', 'head'] as const
/** If an alphanumeric follows the tag name it is a different tag (`<header>` is not `<head>`) */
const NAME_CHAR = /^[a-z0-9]/

/**
 * Drops `<style>…</style>` `<script>…</script>` `<head>…</head>` together with their contents.
 *
 * A regex such as `/<(style|script|head)\b[\s\S]*?<\/\1\s*>/g` is not used:
 * on input with a huge number of `<style>` without closing tags (e.g. a 1.4MB body of
 * 200,000 `<style>` in a row), every failed match restarts from the next position, which
 * makes it O(n^2) (measured: 246ms for 20,000, 980ms for 40,000, 3.9 seconds for 80,000.
 * Just under 2MB exceeds the Worker CPU limit). Here only indexOf is used, giving a linear
 * scan (O(n)) in which the scan position i increases monotonically.
 *
 * When no closing tag is found, everything from there on is discarded (the same handling as
 * stripTagsOnce in src/lib/news/text.ts. No attempt to scan broken input to the end).
 */
function dropBlocks(html: string): string {
  const lower = html.toLowerCase()
  let result = ''
  let i = 0
  const n = html.length

  while (i < n) {
    const lt = lower.indexOf('<', i)
    if (lt === -1) {
      result += html.slice(i)
      break
    }
    const tag = DROP_BLOCK_TAGS.find(
      (t) =>
        lower.startsWith(`<${t}`, lt) &&
        !NAME_CHAR.test(lower.slice(lt + 1 + t.length, lt + 2 + t.length)),
    )
    if (tag === undefined) {
      // A `<` that is not a drop target: advance just 1 character and look for the next
      // (tag contents are handled in a later stage)
      result += html.slice(i, lt + 1)
      i = lt + 1
      continue
    }
    result += html.slice(i, lt)
    const closeStart = lower.indexOf(`</${tag}`, lt)
    if (closeStart === -1) break // No closing tag: discard the whole rest
    const gt = html.indexOf('>', closeStart)
    if (gt === -1) break // The closing tag does not end: same as above
    i = gt + 1
  }

  return result
}

/**
 * After the replacement with newlines is done, removes the remaining tags left inside lines
 * (inline elements such as <b>, and opening tags such as `<div>` `<p>` that BLOCK_END does
 * not remove).
 *
 * Applying `<[^>]*>` with `.replace(..., 'g')` is not used: for the same reason as
 * stripTagsOnce in src/lib/news/text.ts, on input with a huge number of unclosed `<` (e.g. a
 * string of nothing but 200,000 `<` in a row) a global-flag regex restarts from the next
 * position on every failed match and can become O(n^2) (htmlToText receives the HTML of the
 * mail body as is, so getting stuck here freezes the whole receive processing). Here only
 * indexOf is used, giving a linear scan (O(n)) in which the scan position i increases
 * monotonically.
 *
 * On meeting a `<` whose closing `>` is not found, everything from there on is not interpreted
 * as a tag and is kept as text as is (unlike stripTags, the whole rest is not discarded. Not
 * losing the body, even on broken/huge input, takes priority here).
 */
function stripInlineTags(line: string): string {
  let result = ''
  let i = 0
  const n = line.length
  while (i < n) {
    const lt = line.indexOf('<', i)
    if (lt === -1) {
      result += line.slice(i)
      break
    }
    result += line.slice(i, lt)
    const gt = line.indexOf('>', lt)
    if (gt === -1) {
      result += line.slice(lt)
      break
    }
    i = gt + 1
  }
  return result
}

/**
 * Converts to text while keeping paragraphs and newlines. Tag removal is done by
 * stripInlineTags (linear scan), and only entity reference resolution is left to
 * decodeEntities (src/lib/news/text.ts).
 *
 * stripTags itself is not used here: by spec stripTags replaces 1 tag with 1 space (so that
 * words in adjacent tags do not join), so extra spaces would appear around inline tags such
 * as `<b>ご案内</b>`, and on meeting an unclosed `<` it discards the whole rest (see
 * src/lib/news/text.ts). The HTML of a mail body can be broken or huge, so not losing the
 * body takes priority here: tag removal uses our own stripInlineTags, and the input limit is
 * handled by our own guard that returns an empty string beyond MAX_INPUT_LENGTH, the same as
 * stripTags.
 *
 * Unlike stripTags, the 2nd scan of strip -> decode -> strip is not done. That is, a `<...>`
 * that appears after entity decoding (`&lt;b&gt;` etc.) is not stripped (they are characters
 * that were written that way for display, so they are kept. React renders the body as text,
 * so it is not interpreted as HTML. For details see the corresponding test in parse.test.ts).
 */
export function htmlToText(html: string): string {
  if (html.length > MAX_INPUT_LENGTH) return ''
  const withBreaks = dropBlocks(html).replace(BR, '\n').replace(BLOCK_END, '\n')
  return withBreaks
    .split('\n')
    .map((line) =>
      decodeEntities(stripInlineTags(line))
        .replace(/[ \t]+/g, ' ')
        .trim(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeBody(text: string): { text: string; truncated: boolean } {
  const collapsed = text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (collapsed.length <= MAX_BODY_CHARS) return { text: collapsed, truncated: false }
  // collapsed.slice(0, MAX_BODY_CHARS) is not used: it can cut in the middle of a surrogate
  // pair (emoji etc.). truncate (src/lib/news/text.ts) cuts 1 character earlier when the
  // position would split one.
  return { text: truncate(collapsed, MAX_BODY_CHARS), truncated: true }
}

export async function fallbackMessageId(
  from: string,
  subject: string,
  date: string | null,
): Promise<string> {
  const data = new TextEncoder().encode(`${from}\n${subject}\n${date ?? ''}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `hash:${hex}`
}

/**
 * Converts the body to text (design §3-6): the `text` part when present, otherwise `html`
 * converted to text, with blank lines collapsed and cut at the limit.
 *
 * It is separated from toParsedMail **so that it does not run before authorisation**. The
 * HTML -> text conversion gets heavier in proportion to input size, and since anyone who
 * knows `news@` can send mail, running it on mail that gets rejected would hand out the
 * Worker's CPU for free. The caller calls it only when classifyRoute returned
 * auto/manual/system (src/server/mailHandler.ts). The mbox import (scripts/import-mbox.ts)
 * calls it unconditionally because its input is the owner's own Takeout.
 */
export function extractBody(email: Pick<RawParsed, 'text' | 'html'>): {
  text: string
  truncated: boolean
} {
  const rawText =
    email.text && email.text.trim() ? email.text : email.html ? htmlToText(email.html) : ''
  return normalizeBody(rawText)
}

/**
 * Normalises only the headers into ParsedMail (the body is built separately by extractBody).
 * The subject and sender are cut at the stored limits (SUBJECT_MAX / ADDRESS_MAX).
 */
export async function toParsedMail(email: RawParsed): Promise<ParsedMail> {
  const from = truncate((email.from?.address ?? '').trim().toLowerCase(), ADDRESS_MAX)
  const subject = truncate((email.subject ?? '').trim(), SUBJECT_MAX)
  const date = email.date ?? null
  const messageId = email.messageId?.trim() || (await fallbackMessageId(from, subject, date))
  const xff = (email.headers ?? []).find((h) => h.key.toLowerCase() === 'x-forwarded-for')
  const forwardedFor = xff
    ? xff.value
        .split(/\s+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : []
  return {
    messageId,
    from,
    subject,
    date,
    // The body is not built here (see the comment on ParsedMail)
    text: '',
    truncated: false,
    forwardedFor,
  }
}
