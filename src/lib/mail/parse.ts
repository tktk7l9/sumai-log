/**
 * postal-mime の解析結果を、判定に使う形（ParsedMail）に正規化する（設計 2026-09-19 §3-2, 3-6）。
 * postal-mime 自体はここでは呼ばない（Worker とスクリプトが呼び、結果だけ渡す）ので、
 * このファイルは素の Node でテストできる。
 */

import { MAX_INPUT_LENGTH, decodeEntities, truncate } from '../news/text'

export const MAX_BODY_CHARS = 100_000

/**
 * 保存する件名・差出人の上限。`rejected`（＝誰でも送れる）行でもヘッダはそのまま
 * 残すため、数百 KB の Subject を送られると D1 の行がそれだけで膨らむ（拒否行は
 * 30 日残る）。件名は表示側でも 300 字に切っているので 500 で足りる。
 * アドレスは RFC 5321 の上限（path は 256、実用上のアドレスは 320）に合わせる。
 */
export const SUBJECT_MAX = 500
export const ADDRESS_MAX = 320

export type ParsedMail = {
  /** 元メールの Message-ID（<> 付き）。無ければ 'hash:<sha256>' */
  messageId: string
  /** 小文字のアドレス。無ければ ''（ADDRESS_MAX で切る） */
  from: string
  /** SUBJECT_MAX で切る */
  subject: string
  /** ISO-8601。無ければ null */
  date: string | null
  /**
   * 本文は toParsedMail では作らない（常に '' / false）。HTML → テキストの変換は
   * 入力サイズに比例して重く、認可の前に走らせると誰でも Worker の CPU を使えて
   * しまうため、経路が受理されてから extractBody で別に作る（mailHandler 参照）。
   */
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

/** 中身ごと落とす要素（大文字小文字は問わない） */
const DROP_BLOCK_TAGS = ['style', 'script', 'head'] as const
/** タグ名の直後が英数字ならそれは別のタグ（`<header>` は `<head>` ではない） */
const NAME_CHAR = /^[a-z0-9]/

/**
 * `<style>…</style>` `<script>…</script>` `<head>…</head>` を中身ごと落とす。
 *
 * `/<(style|script|head)\b[\s\S]*?<\/\1\s*>/g` のような正規表現は使わない:
 * 閉じタグの無い `<style>` が大量にある入力（例: `<style>` を 20 万個並べた 1.4MB の
 * 本文）で、一致に失敗するたびに次の位置からやり直すため O(n^2) になる
 * （実測: 2 万個で 246ms・4 万個で 980ms・8 万個で 3.9 秒。2MB 弱なら Worker の
 * CPU 上限を超える）。ここでは indexOf だけを使い、走査位置 i が単調に増える
 * 線形走査（O(n)）にする。
 *
 * 閉じタグが見つからない場合はそこから先を丸ごと捨てる（src/lib/news/text.ts の
 * stripTagsOnce と同じ扱い。壊れた入力を最後まで舐めようとしない）。
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
      // 落とす対象ではない `<`: 1 文字だけ進めて次を探す（タグの中身は後段で処理する）
      result += html.slice(i, lt + 1)
      i = lt + 1
      continue
    }
    result += html.slice(i, lt)
    const closeStart = lower.indexOf(`</${tag}`, lt)
    if (closeStart === -1) break // 閉じタグが無い: 残りは丸ごと捨てる
    const gt = html.indexOf('>', closeStart)
    if (gt === -1) break // 閉じタグが終わらない: 同上
    i = gt + 1
  }

  return result
}

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

/**
 * 本文をテキストにする（設計 §3-6）: `text` パートがあればそれ、無ければ `html` を
 * テキスト化し、空行を畳んで上限で切る。
 *
 * toParsedMail から切り離してあるのは **認可の前に走らせないため**。HTML → テキストの
 * 変換は入力サイズに比例して重く、`news@` を知っていれば誰でもメールを送れる以上、
 * 拒否するメールでこれを走らせると Worker の CPU を無償で使わせることになる。
 * 呼び出し側は classifyRoute が auto/manual/system を返したときだけ呼ぶ
 * （src/server/mailHandler.ts）。mbox 取込（scripts/import-mbox.ts）は入力が
 * 本人の Takeout なので無条件に呼ぶ。
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
 * ヘッダだけを ParsedMail に正規化する（本文は extractBody で別に作る）。
 * 件名と差出人は保存する上限（SUBJECT_MAX / ADDRESS_MAX）で切る。
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
    // 本文はここでは作らない（ParsedMail のコメント参照）
    text: '',
    truncated: false,
    forwardedFor,
  }
}
