/**
 * 業者のお知らせ（RSS / HTML）から拾ったテキストを整える最小限のユーティリティ。
 * 外部 HTML パーサは入れない方針（design.md §1）なので、タグ除去もエンティティ
 * 解決も自前の線形走査で行う（`<[^>]*>` のような正規表現は「閉じない `<` が
 * 大量にある」入力で O(n^2) になりうるため使わない。詳しくは stripTagsOnce の
 * コメントを参照）。呼び出し側（parseRss/parseHtmlList）と歩調を合わせ、
 * ここでも MAX_INPUT_LENGTH を超える入力を弾く。
 */

/** 1 ソースあたりの入力上限（文字数）。parseRss/parseHtmlList も同じ値で弾く。 */
export const MAX_INPUT_LENGTH = 2_000_000

/** ゼロ埋め2桁。news 配下の日付組み立てで共通に使う。 */
export function pad(n: number): string {
  return String(n).padStart(2, '0')
}

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

const WHITESPACE = /\s+/g

/** ch がタグ名の終わり（属性の前の空白・自己終端の `/`・`>`・文字列末尾）か。 */
function isTagNameBoundary(ch: string | undefined): boolean {
  return ch === undefined || ch === '>' || ch === '/' || /\s/.test(ch)
}

/**
 * タグを 1 回だけ取り除く（内部専用。`stripTags` から strip → decode → strip の
 * 前後で 2 回呼ばれる）。`<script>`/`<style>` は中身ごと、`<!-- … -->` は
 * コメントとして丸ごと落とす。閉じられない `<`・コメント・`<script>`/`<style>`
 * は、見つかった時点でそこから先を丸ごと捨てる（壊れた入力を最後まで
 * 舐めようとしない）。
 *
 * `<[^>]*>` を `.replace(..., 'g')` で当てる方式は使わない: グローバル
 * フラグの正規表現は一致に失敗するたびに次の位置からやり直すため、
 * 「閉じない `<` が大量にある」入力（例: `<` を 4 万個並べただけの文字列）で
 * O(n^2) になる（実測: 40,000 字で約 600ms、1MB では終わらない）。
 * ここでは `indexOf` だけを使い、走査位置 i が単調に増える一本の線形走査
 * （最悪でも O(n)）で済ませる。
 *
 * 既知の限界: 属性値の中の `>`（例: `<a title="a>b">`）は考慮しない。
 * 単純な `indexOf('>', …)` でタグの終わりを決めるため、そこでタグが
 * 終わったとみなし、残りの属性値がテキストとして漏れることがある。
 * `<script>`/`<style>`/`<!-- -->` は開始・終了トークンそのもので判定する
 * ため、この限界の影響は受けない（中身ごと正しく落ちる）。
 */
/**
 * `recognizeSpecialConstructs` が true のときだけ `<!-- -->`/`<script>`/`<style>`
 * を「中身ごと落とす」対象として認識する。1 回目（生 HTML）は true、2 回目
 * （デコード後）は false で呼ぶ: デコードで初めて現れた `<script>` のような
 * タグ形の断片まで「中身ごと隠す」と、`&lt;script&gt;alert(1)&lt;/script&gt;`
 * の `alert(1)` というテキストまで消えてしまうため（stripTags のコメント参照）。
 */
function stripTagsOnce(html: string, recognizeSpecialConstructs: boolean): string {
  const lowerHtml = html.toLowerCase()
  let result = ''
  let i = 0
  const n = html.length

  while (i < n) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      result += html.slice(i)
      break
    }
    result += html.slice(i, lt)

    if (recognizeSpecialConstructs) {
      if (lowerHtml.startsWith('<!--', lt)) {
        const close = html.indexOf('-->', lt + 4)
        if (close === -1) break // 未終端のコメント: 残りは丸ごと捨てる
        i = close + 3
        result += ' '
        continue
      }

      const isScript = lowerHtml.startsWith('<script', lt) && isTagNameBoundary(html[lt + 7])
      const isStyle =
        !isScript && lowerHtml.startsWith('<style', lt) && isTagNameBoundary(html[lt + 6])
      if (isScript || isStyle) {
        const closeStart = lowerHtml.indexOf(isScript ? '</script' : '</style', lt)
        if (closeStart === -1) break // 閉じタグが無い: 残りは丸ごと捨てる
        const gt = html.indexOf('>', closeStart)
        if (gt === -1) break
        i = gt + 1
        result += ' '
        continue
      }
    }

    const gt = html.indexOf('>', lt)
    if (gt === -1) break // 閉じない `<`: 残りは丸ごと捨てる
    i = gt + 1
    result += ' '
  }

  return result
}

/**
 * タグを取り除いてプレーンテキストにする。`<script>`/`<style>` は中身ごと
 * 落とす。タグは空白 1 個に置き換えてから空白を正規化するので、隣接タグの
 * 単語が結合しない（`<p>A</p><p>B</p>` → `A B`）。
 *
 * strip → decode → strip の順で 2 回走査する。1 回目でタグを落としてから
 * エンティティを解決するので、`&lt;script&gt;alert(1)&lt;/script&gt;` の
 * ようにエスケープされた「タグもどき」は、デコード前は `<` という文字が
 * 存在しないため 1 回目では消費されない。デコード後にもう一度走査する
 * ことで、そのデコード結果に現れた `<script>`/`</script>` のようなタグ形の
 * 断片も記号だけ取り除く（中の `alert(1)` はテキストとして残る。スクリプト
 * として丸ごと隠すのではなく、見た目のタグ記号だけを取る挙動）。
 *
 * トレードオフ: 「`&lt;p&gt;` と書きます」のように、タグの見た目をそのまま
 * 文字として見せたい文面は、この 2 回目の走査で `<p>` の部分が消えてしまう。
 * 本物の HTML（CDATA に生タグが入っている等）と、たまたまタグに見える
 * プレーンテキストを区別する手段が無いための割り切り。
 *
 * 入力が MAX_INPUT_LENGTH を超える場合は空文字を返す。
 */
export function stripTags(html: string): string {
  if (html.length > MAX_INPUT_LENGTH) return ''

  const firstPass = stripTagsOnce(html, true)
  const decoded = decodeEntities(firstPass)
  const secondPass = stripTagsOnce(decoded, false)
  return secondPass.replace(WHITESPACE, ' ').trim()
}

/**
 * `max` 文字を超える分を切り捨てる（省略記号は付けない）。サロゲートペア
 * （絵文字等、UTF-16 で 2 コードユニットの文字）の真ん中では切らない。
 * 割れる位置なら 1 文字分手前で切る。
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const high = text.charCodeAt(max - 1)
  const low = text.charCodeAt(max)
  const splitsSurrogatePair = high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff
  return text.slice(0, splitsSurrogatePair ? max - 1 : max)
}
