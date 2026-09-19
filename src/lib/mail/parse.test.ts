import { describe, expect, it } from 'vitest'

import { MAX_INPUT_LENGTH } from '../news/text'
import { MAX_BODY_CHARS, fallbackMessageId, htmlToText, normalizeBody, toParsedMail } from './parse'

describe('htmlToText', () => {
  it('br / p / div / li / tr の区切りを改行にし、タグと実体参照を落とす', () => {
    const html =
      '<p>見学会の<b>ご案内</b>&amp;地図</p><div>9月27日<br>10時</div><ul><li>A</li><li>B</li></ul>'
    expect(htmlToText(html)).toBe('見学会のご案内&地図\n9月27日\n10時\nA\nB')
  })
  it('style / script の中身は出さない', () => {
    expect(htmlToText('<style>p{}</style><p>本文</p><script>x()</script>')).toBe('本文')
  })
  it('MAX_INPUT_LENGTH を超えたら空文字（stripTags と同じ上限）', () => {
    expect(htmlToText('a'.repeat(MAX_INPUT_LENGTH + 1))).toBe('')
  })
  it('閉じない "<" が大量にあっても線形時間で終わり、テキストとして残す', () => {
    // 20万個の '<' + 'x'。`<[^>]*>` の正規表現を .replace(..., 'g') で当てる
    // 実装だと、一致に失敗するたびに次の位置からやり直すため O(n^2) になり
    // このテストは終わらない（実装は stripInlineTags を参照）。
    const html = '<'.repeat(200_000) + 'x'
    const start = performance.now()
    const result = htmlToText(html)
    const elapsed = performance.now() - start
    // 閉じる '>' が最後まで見つからないので、タグとして解釈せずそのまま残す。
    expect(result).toBe(html)
    expect(elapsed).toBeLessThan(500)
  })
})

describe('normalizeBody', () => {
  it('3 つ以上の連続改行を 2 つに畳み、前後の空白を落とす', () => {
    expect(normalizeBody('\n\na\n\n\n\nb  \n')).toEqual({ text: 'a\n\nb', truncated: false })
  })
  it('上限を超えたら切り捨てて truncated', () => {
    const r = normalizeBody('x'.repeat(MAX_BODY_CHARS + 10))
    expect(r.text.length).toBe(MAX_BODY_CHARS)
    expect(r.truncated).toBe(true)
  })
  it('上限ちょうどの境界にサロゲートペアがあっても割らずに手前で切る', () => {
    // 'x' を (MAX_BODY_CHARS - 1) 個 + 😀（サロゲートペア 2 コードユニット）+ 'y'。
    // 単純な slice(0, MAX_BODY_CHARS) だと 😀 の上位サロゲートだけが残って
    // 不正な文字列になる。
    const input = 'x'.repeat(MAX_BODY_CHARS - 1) + '😀' + 'y'
    const r = normalizeBody(input)
    expect(r.text.length).toBe(MAX_BODY_CHARS - 1)
    expect(r.text.endsWith('x')).toBe(true)
    expect(r.truncated).toBe(true)
  })
})

describe('fallbackMessageId', () => {
  it('同じ入力なら同じ値、違えば違う。hash: 接頭辞', async () => {
    const a = await fallbackMessageId('a@example.com', 's', '2026-09-16T01:00:00Z')
    const b = await fallbackMessageId('a@example.com', 's', '2026-09-16T01:00:00Z')
    const c = await fallbackMessageId('a@example.com', 's', null)
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^hash:[0-9a-f]{64}$/)
  })
})

describe('toParsedMail', () => {
  it('text を優先し、ヘッダから X-Forwarded-For を拾う', async () => {
    const p = await toParsedMail({
      messageId: '<abc@example.com>',
      from: { address: 'News@Example.com' },
      subject: '  件名 ',
      date: '2026-09-16T01:05:00.000Z',
      text: 'テキスト本文',
      html: '<p>HTML本文</p>',
      headers: [{ key: 'x-forwarded-for', value: 'Owner@example.com news@sumai.example' }],
    })
    expect(p).toEqual({
      messageId: '<abc@example.com>',
      from: 'news@example.com',
      subject: '件名',
      date: '2026-09-16T01:05:00.000Z',
      text: 'テキスト本文',
      truncated: false,
      forwardedFor: ['owner@example.com', 'news@sumai.example'],
    })
  })
  it('text が無ければ html をテキスト化。Message-ID が無ければ hash 代替。空の件名は空文字', async () => {
    const p = await toParsedMail({ from: { address: 'a@b.com' }, html: '<p>x</p><p>y</p>' })
    expect(p.text).toBe('x\ny')
    expect(p.messageId).toMatch(/^hash:/)
    expect(p.subject).toBe('')
    expect(p.date).toBeNull()
    expect(p.forwardedFor).toEqual([])
  })
  it('差出人が無ければ from は空文字', async () => {
    const p = await toParsedMail({ text: 'x' })
    expect(p.from).toBe('')
  })
  it('text も html も無ければ本文は空文字', async () => {
    const p = await toParsedMail({ from: { address: 'a@b.com' } })
    expect(p.text).toBe('')
  })
})
