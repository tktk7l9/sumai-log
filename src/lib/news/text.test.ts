import { describe, expect, it } from 'vitest'

import { decodeEntities, stripTags, truncate } from './text'

describe('decodeEntities', () => {
  it('基本のエンティティを解決する', () => {
    expect(decodeEntities('&amp;')).toBe('&')
    expect(decodeEntities('&lt;')).toBe('<')
    expect(decodeEntities('&gt;')).toBe('>')
    expect(decodeEntities('&quot;')).toBe('"')
    expect(decodeEntities('&apos;')).toBe("'")
    expect(decodeEntities('&nbsp;')).toBe(' ')
  })

  it('数値参照（10進・16進）を解決する', () => {
    expect(decodeEntities('&#39;')).toBe("'")
    expect(decodeEntities('&#x27;')).toBe("'")
    expect(decodeEntities('&#X27;')).toBe("'")
    expect(decodeEntities('&#65;')).toBe('A')
  })

  it('複数のエンティティを一度に解決する', () => {
    expect(decodeEntities('A &amp; B &lt;tag&gt;')).toBe('A & B <tag>')
  })

  it('二重エスケープしない（&amp;lt; は &lt; のまま）', () => {
    expect(decodeEntities('&amp;lt;')).toBe('&lt;')
  })

  it('未対応のエンティティはそのまま残す', () => {
    expect(decodeEntities('&copy; 2026')).toBe('&copy; 2026')
  })

  it('エンティティが無ければそのまま返す', () => {
    expect(decodeEntities('plain text')).toBe('plain text')
  })

  it('範囲外・不正な数値参照は例外を投げず元の表記のまま残す', () => {
    // Unicode の上限（U+10FFFF）を超える
    expect(decodeEntities('&#1114112;')).toBe('&#1114112;')
    // 単体のサロゲート（fromCodePoint が例外を投げる範囲）
    expect(decodeEntities('&#55296;')).toBe('&#55296;')
    expect(decodeEntities('&#xD800;')).toBe('&#xD800;')
    // 桁数が大きすぎて Infinity になる
    expect(decodeEntities('&#99999999999999999999999999999;')).toBe(
      '&#99999999999999999999999999999;',
    )
  })
})

describe('stripTags', () => {
  it('タグを取り除く', () => {
    expect(stripTags('<p>本文</p>')).toBe('本文')
  })

  it('隣接するタグの間に空白を入れて単語結合を防ぐ', () => {
    expect(stripTags('<p>A</p><p>B</p>')).toBe('A B')
  })

  it('script/style は中身ごと除去する', () => {
    expect(stripTags('前<script>alert(1)</script>後<style>.a{color:red}</style>末')).toBe(
      '前 後 末',
    )
  })

  it('script/style は大文字小文字や属性があっても除去する', () => {
    expect(stripTags('<SCRIPT type="text/javascript">bad()</SCRIPT>残り')).toBe('残り')
  })

  it('エンティティを解決する', () => {
    expect(stripTags('<p>A &amp; B</p>')).toBe('A & B')
  })

  it('空白（改行・タブ・連続スペース）を正規化する', () => {
    expect(stripTags('<p>行1\n\n行2\t\t行3   行4</p>')).toBe('行1 行2 行3 行4')
  })

  it('前後の空白を落とす', () => {
    expect(stripTags('  <p> 本文 </p>  ')).toBe('本文')
  })

  it('タグが無いプレーンテキストはそのまま（空白正規化のみ）', () => {
    expect(stripTags('plain  text')).toBe('plain text')
  })

  it('空文字は空文字', () => {
    expect(stripTags('')).toBe('')
  })
})

describe('truncate', () => {
  it('上限以下ならそのまま返す', () => {
    expect(truncate('abc', 300)).toBe('abc')
    expect(truncate('abc', 3)).toBe('abc')
  })

  it('上限を超えたら切り詰める', () => {
    expect(truncate('abcdef', 3)).toBe('abc')
  })

  it('空文字は空文字', () => {
    expect(truncate('', 5)).toBe('')
  })
})
