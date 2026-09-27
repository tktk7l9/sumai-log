import { describe, expect, it } from 'vitest'

import { decodeEntities, stripTags, truncate } from './text'

describe('decodeEntities', () => {
  it('resolves the basic entities', () => {
    expect(decodeEntities('&amp;')).toBe('&')
    expect(decodeEntities('&lt;')).toBe('<')
    expect(decodeEntities('&gt;')).toBe('>')
    expect(decodeEntities('&quot;')).toBe('"')
    expect(decodeEntities('&apos;')).toBe("'")
    expect(decodeEntities('&nbsp;')).toBe(' ')
  })

  it('resolves numeric references (decimal and hex)', () => {
    expect(decodeEntities('&#39;')).toBe("'")
    expect(decodeEntities('&#x27;')).toBe("'")
    expect(decodeEntities('&#X27;')).toBe("'")
    expect(decodeEntities('&#65;')).toBe('A')
  })

  it('resolves several entities at once', () => {
    expect(decodeEntities('A &amp; B &lt;tag&gt;')).toBe('A & B <tag>')
  })

  it('does not resolve double escapes (&amp;lt; stays &lt;)', () => {
    expect(decodeEntities('&amp;lt;')).toBe('&lt;')
  })

  it('leaves unsupported entities as they are', () => {
    expect(decodeEntities('&copy; 2026')).toBe('&copy; 2026')
  })

  it('returns the text as is when there are no entities', () => {
    expect(decodeEntities('plain text')).toBe('plain text')
  })

  it('leaves out-of-range / invalid numeric references in their original notation without throwing', () => {
    // Above the Unicode limit (U+10FFFF)
    expect(decodeEntities('&#1114112;')).toBe('&#1114112;')
    // A lone surrogate (the range where fromCodePoint throws)
    expect(decodeEntities('&#55296;')).toBe('&#55296;')
    expect(decodeEntities('&#xD800;')).toBe('&#xD800;')
    // So many digits that it becomes Infinity
    expect(decodeEntities('&#99999999999999999999999999999;')).toBe(
      '&#99999999999999999999999999999;',
    )
  })
})

describe('stripTags', () => {
  it('removes tags', () => {
    expect(stripTags('<p>本文</p>')).toBe('本文')
  })

  it('puts a space between adjacent tags so words do not join', () => {
    expect(stripTags('<p>A</p><p>B</p>')).toBe('A B')
  })

  it('removes script/style together with their contents', () => {
    expect(stripTags('前<script>alert(1)</script>後<style>.a{color:red}</style>末')).toBe(
      '前 後 末',
    )
  })

  it('removes script/style regardless of case or attributes', () => {
    expect(stripTags('<SCRIPT type="text/javascript">bad()</SCRIPT>残り')).toBe('残り')
  })

  it('resolves entities', () => {
    expect(stripTags('<p>A &amp; B</p>')).toBe('A & B')
  })

  it('normalizes whitespace (newlines, tabs, repeated spaces)', () => {
    expect(stripTags('<p>行1\n\n行2\t\t行3   行4</p>')).toBe('行1 行2 行3 行4')
  })

  it('trims leading and trailing whitespace', () => {
    expect(stripTags('  <p> 本文 </p>  ')).toBe('本文')
  })

  it('plain text without tags stays as is (whitespace normalization only)', () => {
    expect(stripTags('plain  text')).toBe('plain text')
  })

  it('an empty string stays an empty string', () => {
    expect(stripTags('')).toBe('')
  })

  it('scans a fake tag escaped with entities once more after decoding and drops only the symbols', () => {
    // The case where <script>alert(1)</script> is escaped and written as body text.
    // Unlike a raw <script>, the contents are not hidden with it; only the symbols (angle
    // brackets) are dropped and the alert(1) inside stays as text.
    expect(stripTags('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('alert(1)')
  })

  it('checks the name boundary for script/style (<scriptx> is not treated as a script tag)', () => {
    // Unlike a real script/style, which disappears with its contents, <scriptx> is a plain tag:
    // only the symbols are dropped and the text inside stays.
    expect(stripTags('<scriptx>keep</scriptx>')).toBe('keep')
  })

  it('drops an HTML comment with its contents (a > inside does not end it early)', () => {
    expect(stripTags('前<!-- a > b -->後')).toBe('前 後')
  })

  it('discards everything from an unterminated comment, script or tag onward', () => {
    expect(stripTags('前<!-- 閉じないコメント')).toBe('前')
    expect(stripTags('前<script>閉じないスクリプト')).toBe('前')
    expect(stripTags('前<div class="閉じないタグ')).toBe('前')
  })

  it('discards everything when the closing tag of script/style exists but its final `>` is missing', () => {
    expect(stripTags('前<script>alert(1)</script')).toBe('前')
  })

  it('finishes in under 1 second even with a huge number of unclosed `<` (checks the linear scan)', () => {
    const start = performance.now()
    const result = stripTags('<'.repeat(200_000))
    const elapsed = performance.now() - start
    expect(result).toBe('')
    expect(elapsed).toBeLessThan(1000)
  })

  it('gives an empty string for input longer than MAX_INPUT_LENGTH', () => {
    expect(stripTags('a'.repeat(2_000_001))).toBe('')
  })
})

describe('truncate', () => {
  it('returns the text as is when it is within the limit', () => {
    expect(truncate('abc', 300)).toBe('abc')
    expect(truncate('abc', 3)).toBe('abc')
  })

  it('truncates when over the limit', () => {
    expect(truncate('abcdef', 3)).toBe('abc')
  })

  it('an empty string stays an empty string', () => {
    expect(truncate('', 5)).toBe('')
  })

  it('does not cut in the middle of a surrogate pair (emoji)', () => {
    // 'AB' + 😀 (surrogate pair, 2 units) + 'CD'
    const text = 'AB😀CD'
    // max=3 is a position that splits the pair (right after the high surrogate) -> cut 1 char earlier
    expect(truncate(text, 3)).toBe('AB')
    // max=4 is right after the pair (no split) -> cut including the emoji
    expect(truncate(text, 4)).toBe('AB😀')
  })
})
