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

  it('エンティティでエスケープされた偽タグは、デコード後にもう一度走査して記号だけ落とす', () => {
    // <script>alert(1)</script> がエスケープされて本文として書かれているケース。
    // 生の <script> と違って中身ごと隠すのではなく、記号（山括弧）だけ落として
    // 中身の alert(1) はテキストとして残る。
    expect(stripTags('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('alert(1)')
  })

  it('script/style は名前の境界を見る（<scriptx> は script タグ扱いしない）', () => {
    // 中身ごと消える本物の script/style と違い、<scriptx> はただのタグとして
    // 記号だけ落ち、中身のテキストは残る。
    expect(stripTags('<scriptx>keep</scriptx>')).toBe('keep')
  })

  it('HTML コメントは中身ごと落ちる（内部に > があっても誤終端しない）', () => {
    expect(stripTags('前<!-- a > b -->後')).toBe('前 後')
  })

  it('未終端のコメント・script・タグはそこから先を丸ごと捨てる', () => {
    expect(stripTags('前<!-- 閉じないコメント')).toBe('前')
    expect(stripTags('前<script>閉じないスクリプト')).toBe('前')
    expect(stripTags('前<div class="閉じないタグ')).toBe('前')
  })

  it('script/style の閉じタグ自体はあっても、その終端 `>` が無ければ丸ごと捨てる', () => {
    expect(stripTags('前<script>alert(1)</script')).toBe('前')
  })

  it('閉じない `<` が大量にあっても 1 秒未満で終わる（線形走査の確認）', () => {
    const start = performance.now()
    const result = stripTags('<'.repeat(200_000))
    const elapsed = performance.now() - start
    expect(result).toBe('')
    expect(elapsed).toBeLessThan(1000)
  })

  it('MAX_INPUT_LENGTH を超える入力は空文字', () => {
    expect(stripTags('a'.repeat(2_000_001))).toBe('')
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

  it('サロゲートペア（絵文字）の真ん中では切らない', () => {
    // 'AB' + 😀（サロゲートペア2ユニット） + 'CD'
    const text = 'AB😀CD'
    // max=3 はペアの真ん中（高位サロゲートの直後）で割れる位置 → 1 文字手前で切る
    expect(truncate(text, 3)).toBe('AB')
    // max=4 はペアの直後（割れない）→ 絵文字を含めて切る
    expect(truncate(text, 4)).toBe('AB😀')
  })
})
