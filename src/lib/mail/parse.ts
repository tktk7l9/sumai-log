/**
 * postal-mime の解析結果を、判定に使う形（ParsedMail）に正規化する（設計 2026-09-19 §3-2, 3-6）。
 * postal-mime 自体はここでは呼ばない（Worker とスクリプトが呼び、結果だけ渡す）ので、
 * このファイルは素の Node でテストできる。
 */

import { MAX_INPUT_LENGTH, decodeEntities, truncate } from '../news/text'

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

/**
 * 改行への置き換えが終わった後、行内に残る残りのタグ（<b> 等のインライン要素や、
 * BLOCK_END では消えない開始タグ `<div>` `<p>` 等）を取り除く。
 *
 * `<[^>]*>` を `.replace(..., 'g')` で当てる方式は使わない: src/lib/news/text.ts
 * の stripTagsOnce と同じ理由で、閉じない `<` が大量にある入力（例: `<` を
 * 20万個並べただけの文字列）でグローバルフラグの正規表現は一致に失敗する
 * たびに次の位置からやり直すため O(n^2) になりうる（htmlToText はメール本文の
 * HTML をそのまま受け取るため、ここで詰まると受信処理全体が固まる）。ここでは
 * indexOf だけを使い、走査位置 i が単調に増える線形走査（O(n)）にする。
 *
 * 閉じる `>` が見つからない `<` に出会ったら、そこから先はタグとして解釈せず
 * そのままテキストとして残す（stripTags のように「残りを丸ごと捨てる」ことは
 * しない。壊れた/巨大な入力でも本文を失わない方をここでは優先する）。
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
 * 段落と改行を保ってテキストにする。タグの除去は stripInlineTags（線形走査）
 * で行い、実体参照の解決だけ decodeEntities（src/lib/news/text.ts）に任せる。
 *
 * stripTags 自体はここでは使わない: stripTags はタグ 1 個を空白 1 個に
 * 置き換える仕様（隣接タグの単語が結合しないため）なので、`<b>ご案内</b>`
 * のようなインラインタグの前後に余計な空白が入ってしまう上、閉じない `<`
 * に出会うと「残りを丸ごと捨てる」（src/lib/news/text.ts 参照）。メール本文の
 * HTML は壊れていたり巨大だったりし得るため、ここでは本文を失わないことを
 * 優先し、タグ除去は自前の stripInlineTags、入力上限は stripTags と同じ
 * MAX_INPUT_LENGTH を超えたら空文字にする独自ガードで対応する。
 *
 * stripTags と違い strip→decode→strip の 2 回目の走査はしない。つまり
 * エンティティ復号後に現れる `<...>`（`&lt;b&gt;` 等）は剥がさない
 * （表示上そう書かれていた文字なので残す。本文は React がテキストとして
 * 描画するので HTML として解釈されない。詳細は parse.test.ts の該当テスト
 * 参照）。
 */
export function htmlToText(html: string): string {
  if (html.length > MAX_INPUT_LENGTH) return ''
  const withBreaks = html.replace(DROP_BLOCKS, '').replace(BR, '\n').replace(BLOCK_END, '\n')
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
  // collapsed.slice(0, MAX_BODY_CHARS) は使わない: サロゲートペア（絵文字等）の
  // 真ん中で切れることがある。truncate（src/lib/news/text.ts）は割れる位置なら
  // 1 文字分手前で切ってくれる。
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
