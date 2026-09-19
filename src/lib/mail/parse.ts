/**
 * postal-mime の解析結果を、判定に使う形（ParsedMail）に正規化する（設計 2026-09-19 §3-2, 3-6）。
 * postal-mime 自体はここでは呼ばない（Worker とスクリプトが呼び、結果だけ渡す）ので、
 * このファイルは素の Node でテストできる。
 */

import { stripTags } from '../news/text'

export const MAX_BODY_CHARS = 100_000

export type ParsedMail = {
  /** 元メールの Message-ID（<> 付き）。無ければ 'hash:<sha256>' */
  messageId: string
  /** 小文字のアドレス。無ければ '' */
  from: string
  subject: string
  /** ISO-8601。無ければ null */
  date: string | null
  text: string
  truncated: boolean
  /** X-Forwarded-For ヘッダを空白で分けて小文字にしたもの（Gmail の自動転送が付ける） */
  forwardedFor: string[]
}

/** postal-mime の Email のうち使う部分だけ */
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
const DROP_BLOCKS = /<(style|script|head)\b[\s\S]*?<\/\1\s*>/gi
// 改行への置き換えが終わった後、行内に残る残りのタグ（<b> 等のインライン要素）を
// 消す。stripTags はタグ 1 個を空白 1 個に置き換える仕様（隣接タグの単語が結合
// しないため）なので、そのまま行に通すと `<b>ご案内</b>` のようなインライン
// タグの前後に余計な空白が入ってしまう。ここで先にタグ記号だけを空文字で
// 落としてから stripTags に渡す（実体参照の解決・残る空白の正規化だけを
// stripTags に任せる）。
const REMAINING_TAG = /<[^>]*>/g

/** 段落と改行を保ってテキストにする（タグは stripTags の前に自前で除去し、余計な空白を入れない） */
export function htmlToText(html: string): string {
  const withBreaks = html.replace(DROP_BLOCKS, '').replace(BR, '\n').replace(BLOCK_END, '\n')
  return withBreaks
    .split('\n')
    .map((line) => stripTags(line.replace(REMAINING_TAG, '')))
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
  return { text: collapsed.slice(0, MAX_BODY_CHARS), truncated: true }
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

export async function toParsedMail(email: RawParsed): Promise<ParsedMail> {
  const from = (email.from?.address ?? '').trim().toLowerCase()
  const subject = (email.subject ?? '').trim()
  const date = email.date ?? null
  const rawText =
    email.text && email.text.trim() ? email.text : email.html ? htmlToText(email.html) : ''
  const body = normalizeBody(rawText)
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
    text: body.text,
    truncated: body.truncated,
    forwardedFor,
  }
}
