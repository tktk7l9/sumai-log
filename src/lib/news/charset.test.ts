import { describe, expect, it } from 'vitest'

import { detectCharset } from './charset'

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('detectCharset', () => {
  it('prefers the charset of Content-Type (unquoted)', () => {
    expect(detectCharset('text/html; charset=Shift_JIS', bytesOf(''))).toBe('Shift_JIS')
  })

  it('also reads the charset of Content-Type in double quotes', () => {
    expect(detectCharset('application/rss+xml; charset="UTF-8"', bytesOf(''))).toBe('UTF-8')
  })

  it('gives utf-8 when there is neither Content-Type nor <meta>', () => {
    expect(detectCharset(null, bytesOf('<html><body>本文</body></html>'))).toBe('utf-8')
  })

  it('sniffs <meta charset="…"> when Content-Type has no charset', () => {
    const html = '<html><head><meta charset="EUC-JP"></head><body></body></html>'
    expect(detectCharset('text/html', bytesOf(html))).toBe('EUC-JP')
  })

  it('also sniffs the <meta http-equiv="Content-Type" content="…charset=…"> form', () => {
    const html =
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS"></head></html>'
    expect(detectCharset(null, bytesOf(html))).toBe('Shift_JIS')
  })

  it('does not look at <meta> when Content-Type has a charset (the header wins)', () => {
    const html = '<html><head><meta charset="EUC-JP"></head></html>'
    expect(detectCharset('text/html; charset=UTF-8', bytesOf(html))).toBe('UTF-8')
  })

  it('finds a later <meta charset> even when a <meta> without charset comes first', () => {
    const html =
      '<html><head><meta name="viewport" content="width=device-width"><meta charset="UTF-8"></head></html>'
    expect(detectCharset(null, bytesOf(html))).toBe('UTF-8')
  })

  it('does not find a <meta> past the first 2KB of the body and falls back to utf-8', () => {
    const padding = ' '.repeat(2048)
    const html = `<html><head>${padding}<meta charset="EUC-JP"></head></html>`
    expect(detectCharset(null, bytesOf(html))).toBe('utf-8')
  })

  it('returns utf-8 without throwing for an empty byte array', () => {
    expect(detectCharset(null, new Uint8Array())).toBe('utf-8')
  })
})
