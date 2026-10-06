/**
 * Minimal utilities that tidy up text picked up from vendor news (RSS / HTML).
 * The policy is not to add an external HTML parser (design.md §1), so both tag removal and
 * entity resolution are done with our own linear scan (a regular expression like `<[^>]*>` is
 * not used because it can become O(n^2) on input with "a huge number of unclosed `<`". See
 * the comment of stripTagsOnce for details). In step with the callers
 * (parseRss/parseHtmlList), input longer than MAX_INPUT_LENGTH is rejected here too.
 */

/** Input limit per source (in characters). parseRss/parseHtmlList reject with the same value. */
export const MAX_INPUT_LENGTH = 2_000_000

/** Zero-padded 2 digits. Shared by the date building under news. */
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

// Lists only the supported range. Unknown entities (&copy; etc.) are left as they are.
const ENTITY_PATTERN = /&(amp|lt|gt|quot|apos|nbsp|#\d+|#[xX][0-9a-fA-F]+);/g

const MAX_CODE_POINT = 0x10ffff

/** Rejects a lone surrogate because fromCodePoint throws on it. */
function isValidCodePoint(codePoint: number): boolean {
  return (
    Number.isFinite(codePoint) &&
    codePoint >= 0 &&
    codePoint <= MAX_CODE_POINT &&
    !(codePoint >= 0xd800 && codePoint <= 0xdfff)
  )
}

/**
 * Resolves `&amp; &lt; &gt; &quot; &apos; &nbsp;` and numeric references (`&#39;` `&#x27;`).
 * It replaces from the left in a single scan, so a double escape such as `&amp;lt;` stays
 * `&lt;` (it is not resolved twice into `<`). An out-of-range numeric reference
 * (`&#99999999;` etc., which can arrive when an external feed is broken) does not throw and
 * is left in its original notation.
 */
export function decodeEntities(text: string): string {
  return text.replace(ENTITY_PATTERN, (match, code: string) => {
    const named = NAMED_ENTITIES[code]
    if (named !== undefined) return named
    // By the definition of ENTITY_PATTERN, what remains is always #\d+ or #[xX][0-9a-fA-F]+
    const isHex = code[1] === 'x' || code[1] === 'X'
    const codePoint = Number.parseInt(isHex ? code.slice(2) : code.slice(1), isHex ? 16 : 10)
    return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : match
  })
}

const WHITESPACE = /\s+/g

/**
 * Whether ch ends a tag name (whitespace before attributes, self-closing `/`, `>`, end of
 * string).
 */
function isTagNameBoundary(ch: string | undefined): boolean {
  return ch === undefined || ch === '>' || ch === '/' || /\s/.test(ch)
}

/**
 * Removes tags exactly once (internal only. Called twice from `stripTags`, before and after
 * the decode of strip -> decode -> strip). `<script>`/`<style>` are dropped with their
 * contents, and `<!-- … -->` is dropped whole as a comment. For an unclosed `<`, comment or
 * `<script>`/`<style>`, everything from the point where it is found is discarded (no attempt
 * to walk broken input to the end).
 *
 * The approach of applying `<[^>]*>` with `.replace(..., 'g')` is not used: a regular
 * expression with the global flag restarts from the next position every time a match fails,
 * so on input with "a huge number of unclosed `<`" (e.g. a string of just 40,000 `<`) it
 * becomes O(n^2) (measured: about 600ms for 40,000 chars, never finishes for 1MB).
 * Here only `indexOf` is used, and a single linear scan in which the scan position i grows
 * monotonically (O(n) at worst) does the job.
 *
 * Known limitation: a `>` inside an attribute value (e.g. `<a title="a>b">`) is not
 * considered. The end of a tag is decided by a simple `indexOf('>', …)`, so the tag is taken
 * to end there and the rest of the attribute value can leak as text.
 * `<script>`/`<style>`/`<!-- -->` are decided by their own start / end tokens, so they are not
 * affected by this limitation (they are dropped correctly with their contents).
 */
/**
 * Only when `recognizeSpecialConstructs` is true are `<!-- -->`/`<script>`/`<style>`
 * recognized as things to "drop with their contents". The 1st call (raw HTML) passes true and
 * the 2nd (after decoding) passes false: if tag-shaped fragments such as a `<script>` that
 * first appeared through decoding were also "hidden with their contents", even the text
 * `alert(1)` of `&lt;script&gt;alert(1)&lt;/script&gt;` would disappear (see the comment of
 * stripTags).
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
        if (close === -1) break // Unterminated comment: discard the whole rest
        i = close + 3
        result += ' '
        continue
      }

      const isScript = lowerHtml.startsWith('<script', lt) && isTagNameBoundary(html[lt + 7])
      const isStyle =
        !isScript && lowerHtml.startsWith('<style', lt) && isTagNameBoundary(html[lt + 6])
      if (isScript || isStyle) {
        const closeStart = lowerHtml.indexOf(isScript ? '</script' : '</style', lt)
        if (closeStart === -1) break // No closing tag: discard the whole rest
        const gt = html.indexOf('>', closeStart)
        if (gt === -1) break
        i = gt + 1
        result += ' '
        continue
      }
    }

    const gt = html.indexOf('>', lt)
    if (gt === -1) break // Unclosed `<`: discard the whole rest
    i = gt + 1
    result += ' '
  }

  return result
}

/**
 * Removes tags to make plain text. `<script>`/`<style>` are dropped with their contents.
 * Tags are replaced with 1 space and then whitespace is normalized, so the words of
 * adjacent tags do not join (`<p>A</p><p>B</p>` -> `A B`).
 *
 * It scans twice, in the order strip -> decode -> strip. Tags are dropped in the 1st pass and
 * then entities are resolved, so an escaped "pseudo tag" such as
 * `&lt;script&gt;alert(1)&lt;/script&gt;` is not consumed in the 1st pass because the
 * character `<` does not exist before decoding. Scanning once more after decoding removes
 * only the symbols of tag-shaped fragments such as `<script>`/`</script>` that appeared in
 * the decoded result (the `alert(1)` inside stays as text. The behavior is to take only the
 * visible tag symbols, not to hide the whole thing as a script).
 *
 * Trade-off: wording that wants to show the look of a tag as characters, such as
 * "`&lt;p&gt;` と書きます", loses the `<p>` part in this 2nd scan.
 * This is an accepted compromise because there is no way to tell real HTML (raw tags inside
 * CDATA etc.) from plain text that happens to look like a tag.
 *
 * Returns an empty string when the input is longer than MAX_INPUT_LENGTH.
 */
export function stripTags(html: string): string {
  if (html.length > MAX_INPUT_LENGTH) return ''

  const firstPass = stripTagsOnce(html, true)
  const decoded = decodeEntities(firstPass)
  const secondPass = stripTagsOnce(decoded, false)
  return secondPass.replace(WHITESPACE, ' ').trim()
}

/** `\b` after a tag name: the next character is not a word character (or the input ends) */
function isWordBoundary(ch: string | undefined): boolean {
  return ch === undefined || !/[A-Za-z0-9_]/.test(ch)
}

/**
 * Takes the contents of every `<tag …>…</tag>` element, in document order, with one linear
 * scan. Same result as `/<tag\b[^>]*>([\s\S]*?)<\/tag>/gi` (case-insensitive, the first `>`
 * ends the opening tag, the nearest `</tag>` ends the element, no nesting), but a regular
 * expression with the global flag restarts from the next position every time a match fails,
 * so on fetched input with a huge number of unclosed `<item>` / `<li>` (a hostile or broken
 * vendor page; the fetch limit is 1 MB) it becomes O(n^2) (measured: 400ms for 20,000
 * openers, 1.8 seconds for 40,000, and the 1 MB case exceeds the Worker CPU limit, which
 * kills the whole Cron run). Here only `indexOf` is used and the scan position only grows.
 *
 * An opening tag with no `>` after it, or an element with no `</tag>` after it, ends the
 * scan (nothing later could match either). At most `max` blocks are returned.
 */
export function extractElementBlocks(html: string, tag: string, max = Infinity): string[] {
  const lower = html.toLowerCase()
  const open = `<${tag.toLowerCase()}`
  const close = `</${tag.toLowerCase()}>`
  const blocks: string[] = []
  let i = 0
  while (blocks.length < max) {
    const lt = lower.indexOf(open, i)
    if (lt === -1) break
    const nameEnd = lt + open.length
    if (!isWordBoundary(lower[nameEnd])) {
      i = nameEnd // `<items>` / `<link>` is a different tag; keep looking after it
      continue
    }
    const gt = lower.indexOf('>', nameEnd)
    if (gt === -1) break
    const end = lower.indexOf(close, gt + 1)
    if (end === -1) break
    blocks.push(html.slice(gt + 1, end))
    i = end + close.length
  }
  return blocks
}

/**
 * Cuts off what exceeds `max` characters (no ellipsis is added). It does not cut in the middle
 * of a surrogate pair (emoji etc., characters of 2 code units in UTF-16).
 * At a position that would split one, it cuts 1 character earlier.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const high = text.charCodeAt(max - 1)
  const low = text.charCodeAt(max)
  const splitsSurrogatePair = high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff
  return text.slice(0, splitsSurrogatePair ? max - 1 : max)
}
