/**
 * 業者のお知らせ（RSS / HTML）から拾ったテキストを整える最小限のユーティリティ。
 * 外部 HTML パーサは入れない方針（design.md §1）なので、タグ除去もエンティティ
 * 解決も正規表現で行う。入力は 1 ソースあたり 1 MB 上限（呼び出し側で切る）を
 * 前提にしており、ここでは線形にしか走らない置換だけを使う（破局的バックトラック回避）。
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

// 対応する範囲だけを列挙する。未知のエンティティ（&copy; 等）はそのまま残す。
const ENTITY_PATTERN = /&(amp|lt|gt|quot|apos|nbsp|#\d+|#[xX][0-9a-fA-F]+);/g

const MAX_CODE_POINT = 0x10ffff

/** サロゲート単体は fromCodePoint が例外を投げるので弾く。 */
function isValidCodePoint(codePoint: number): boolean {
  return (
    Number.isFinite(codePoint) &&
    codePoint >= 0 &&
    codePoint <= MAX_CODE_POINT &&
    !(codePoint >= 0xd800 && codePoint <= 0xdfff)
  )
}

/**
 * `&amp; &lt; &gt; &quot; &apos; &nbsp;` と数値参照（`&#39;` `&#x27;`）を解決する。
 * 一度の走査で左から置換するため `&amp;lt;` のような二重エスケープは
 * `&lt;` のまま（二重に解決して `<` にはならない）。範囲外の数値参照
 * （`&#99999999;` 等、外部フィードが壊れていれば来うる）は例外を投げずに
 * 元の表記のまま残す。
 */
export function decodeEntities(text: string): string {
  return text.replace(ENTITY_PATTERN, (match, code: string) => {
    const named = NAMED_ENTITIES[code]
    if (named !== undefined) return named
    // 残るのは ENTITY_PATTERN の定義から必ず #\d+ か #[xX][0-9a-fA-F]+
    const isHex = code[1] === 'x' || code[1] === 'X'
    const codePoint = Number.parseInt(isHex ? code.slice(2) : code.slice(1), isHex ? 16 : 10)
    return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : match
  })
}

const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const ANY_TAG = /<[^>]*>/g
const WHITESPACE = /\s+/g

/**
 * タグを取り除いてプレーンテキストにする。`<script>`/`<style>` は中身ごと
 * 落とす。タグは空白 1 個に置き換えてから空白を正規化するので、隣接タグの
 * 単語が結合しない（`<p>A</p><p>B</p>` → `A B`）。
 */
export function stripTags(html: string): string {
  const withoutScriptStyle = html.replace(SCRIPT_OR_STYLE, ' ')
  const withoutTags = withoutScriptStyle.replace(ANY_TAG, ' ')
  const decoded = decodeEntities(withoutTags)
  return decoded.replace(WHITESPACE, ' ').trim()
}

/** `max` 文字を超える分を切り捨てる（省略記号は付けない）。 */
export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text
}
