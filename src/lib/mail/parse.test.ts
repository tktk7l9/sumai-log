import { describe, expect, it } from 'vitest'

import { MAX_INPUT_LENGTH } from '../news/text'
import {
  ADDRESS_MAX,
  MAX_BODY_CHARS,
  SUBJECT_MAX,
  extractBody,
  fallbackMessageId,
  htmlToText,
  normalizeBody,
  toParsedMail,
} from './parse'

describe('htmlToText', () => {
  it('turns br / p / div / li / tr boundaries into newlines and drops tags and entity references', () => {
    const html =
      '<p>見学会の<b>ご案内</b>&amp;地図</p><div>9月27日<br>10時</div><ul><li>A</li><li>B</li></ul>'
    expect(htmlToText(html)).toBe('見学会のご案内&地図\n9月27日\n10時\nA\nB')
  })
  it('does not output the contents of style / script', () => {
    expect(htmlToText('<style>p{}</style><p>本文</p><script>x()</script>')).toBe('本文')
  })
  it('drops head, and style with attributes, contents included', () => {
    expect(
      htmlToText('<head><title>t</title></head><style type="text/css">p{}</style><p>本文</p>'),
    ).toBe('本文')
  })
  it('does not drop an element that only matches part of the tag name (header)', () => {
    // It starts with `<head` but an alphanumeric follows, so it is a different tag. Its
    // contents (the heading) must not be removed. `<header>` is not a target for inserting a
    // newline (BLOCK_END), so it runs straight into the body.
    expect(htmlToText('<header>見出し</header><p>本文</p>')).toBe('見出し本文')
  })
  it('discards everything after an unclosed style block', () => {
    expect(htmlToText('<p>本文</p><style>p{}')).toBe('本文')
  })
  it('discards everything after it even when the closing tag does not end with "&gt;"', () => {
    expect(htmlToText('<p>本文</p><style>p{}</style')).toBe('本文')
  })
  it('finishes in linear time even with a huge number of unclosed style tags', () => {
    // 200,000 `<style>` (about 1.4MB. Below MAX_INPUT_LENGTH, so content processing starts).
    // With the regex `/<(style|script|head)\b[\s\S]*?<\/\1\s*>/g`, every failed match restarts
    // from the next position, which makes it O(n^2), and this test never finishes
    // (measured: 246ms for 20,000, 980ms for 40,000, 3.9 seconds for 80,000).
    const html = '<style>'.repeat(200_000)
    const start = performance.now()
    const result = htmlToText(html)
    const elapsed = performance.now() - start
    // There is no closing tag, so everything from the first <style> on is discarded
    expect(result).toBe('')
    expect(elapsed).toBeLessThan(2000)
  })
  it('returns an empty string beyond MAX_INPUT_LENGTH (the same limit as stripTags)', () => {
    expect(htmlToText('a'.repeat(MAX_INPUT_LENGTH + 1))).toBe('')
  })
  it('finishes in linear time even with a huge number of unclosed "<" and keeps them as text', () => {
    // 200,000 '<' + 'x'. An implementation that applies the regex `<[^>]*>` with
    // .replace(..., 'g') restarts from the next position on every failed match, which makes it
    // O(n^2), and this test never finishes (see stripInlineTags for the implementation).
    const html = '<'.repeat(200_000) + 'x'
    const start = performance.now()
    const result = htmlToText(html)
    const elapsed = performance.now() - start
    // The closing '>' is never found, so they are not interpreted as tags and are kept as is.
    expect(result).toBe(html)
    // A loose limit that allows for jitter in the CI environment (confirming linear time is
    // enough; the local measurement is under 1ms). If it regressed to O(n^2), it would take
    // several seconds or never finish at all.
    expect(elapsed).toBeLessThan(2000)
  })
  it('does not strip angle brackets that appear after entity decoding (kept as displayed characters)', () => {
    // A deliberate spec: the 2nd scan of stripTags (strip -> decode -> strip) is not done
    // (see the htmlToText comment in parse.ts). An &lt;b&gt; in a mail body is written
    // with the intent of showing the characters <b>, so interpreting it as a tag after
    // decoding and removing it would lose displayed characters.
    // React renders the body as text (it is not interpreted as HTML), so keeping it here
    // poses no safety problem.
    expect(htmlToText('<p>&lt;b&gt;太字&lt;/b&gt;</p>')).toBe('<b>太字</b>')
  })
})

describe('normalizeBody', () => {
  it('collapses 3 or more consecutive newlines into 2 and strips leading and trailing whitespace', () => {
    expect(normalizeBody('\n\na\n\n\n\nb  \n')).toEqual({ text: 'a\n\nb', truncated: false })
  })
  it('cuts and marks truncated beyond the limit', () => {
    const r = normalizeBody('x'.repeat(MAX_BODY_CHARS + 10))
    expect(r.text.length).toBe(MAX_BODY_CHARS)
    expect(r.truncated).toBe(true)
  })
  it('cuts before a surrogate pair sitting exactly on the limit boundary instead of splitting it', () => {
    // (MAX_BODY_CHARS - 1) 'x' + 😀 (a surrogate pair, 2 code units) + 'y'.
    // A plain slice(0, MAX_BODY_CHARS) would leave only the high surrogate of 😀 and
    // produce an invalid string.
    const input = 'x'.repeat(MAX_BODY_CHARS - 1) + '😀' + 'y'
    const r = normalizeBody(input)
    expect(r.text.length).toBe(MAX_BODY_CHARS - 1)
    expect(r.text.endsWith('x')).toBe(true)
    expect(r.truncated).toBe(true)
  })
})

describe('fallbackMessageId', () => {
  it('gives the same value for the same input and a different one otherwise. hash: prefix', async () => {
    const a = await fallbackMessageId('a@example.com', 's', '2026-09-16T01:00:00Z')
    const b = await fallbackMessageId('a@example.com', 's', '2026-09-16T01:00:00Z')
    const c = await fallbackMessageId('a@example.com', 's', null)
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^hash:[0-9a-f]{64}$/)
  })
})

describe('extractBody', () => {
  it('uses the text part when present (does not look at html)', () => {
    expect(extractBody({ text: 'テキスト本文', html: '<p>HTML本文</p>' })).toEqual({
      text: 'テキスト本文',
      truncated: false,
    })
  })
  it('converts html to text when text is whitespace only', () => {
    expect(extractBody({ text: '   ', html: '<p>x</p><p>y</p>' })).toEqual({
      text: 'x\ny',
      truncated: false,
    })
  })
  it('converts html to text when there is no text', () => {
    expect(extractBody({ html: '<p>x</p>' })).toEqual({ text: 'x', truncated: false })
  })
  it('returns an empty string when there is neither text nor html', () => {
    expect(extractBody({})).toEqual({ text: '', truncated: false })
  })
  it('marks truncated beyond the limit', () => {
    const r = extractBody({ text: 'x'.repeat(MAX_BODY_CHARS + 10) })
    expect(r.text.length).toBe(MAX_BODY_CHARS)
    expect(r.truncated).toBe(true)
  })
})

describe('toParsedMail', () => {
  it('normalises only the headers (does not build the body). Picks up X-Forwarded-For too', async () => {
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
      // The body is built by extractBody after authorisation (always empty here)
      text: '',
      truncated: false,
      forwardedFor: ['owner@example.com', 'news@sumai.example'],
    })
  })
  it('substitutes a hash when there is no Message-ID. An empty subject gives an empty string', async () => {
    const p = await toParsedMail({ from: { address: 'a@b.com' }, html: '<p>x</p><p>y</p>' })
    expect(p.messageId).toMatch(/^hash:/)
    expect(p.subject).toBe('')
    expect(p.date).toBeNull()
    expect(p.forwardedFor).toEqual([])
  })
  it('gives an empty string for from when there is no sender', async () => {
    const p = await toParsedMail({ text: 'x' })
    expect(p.from).toBe('')
  })
  it('cuts the subject at SUBJECT_MAX (because headers are stored even for rejected mail)', async () => {
    const p = await toParsedMail({ subject: 'あ'.repeat(SUBJECT_MAX + 100) })
    expect(p.subject.length).toBe(SUBJECT_MAX)
  })
  it('cuts the sender address at ADDRESS_MAX', async () => {
    const p = await toParsedMail({ from: { address: `${'a'.repeat(ADDRESS_MAX)}@example.com` } })
    expect(p.from.length).toBe(ADDRESS_MAX)
  })
})
