import { describe, expect, it } from 'vitest'

import { detectCharset } from './charset'

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('detectCharset', () => {
  it('Content-Type の charset（クォート無し）を優先する', () => {
    expect(detectCharset('text/html; charset=Shift_JIS', bytesOf(''))).toBe('Shift_JIS')
  })

  it('Content-Type の charset（ダブルクォート付き）も読める', () => {
    expect(detectCharset('application/rss+xml; charset="UTF-8"', bytesOf(''))).toBe('UTF-8')
  })

  it('Content-Type が無く <meta> も無ければ utf-8', () => {
    expect(detectCharset(null, bytesOf('<html><body>本文</body></html>'))).toBe('utf-8')
  })

  it('Content-Type に charset が無ければ <meta charset="…"> を sniff する', () => {
    const html = '<html><head><meta charset="EUC-JP"></head><body></body></html>'
    expect(detectCharset('text/html', bytesOf(html))).toBe('EUC-JP')
  })

  it('<meta http-equiv="Content-Type" content="…charset=…"> の形も sniff する', () => {
    const html =
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS"></head></html>'
    expect(detectCharset(null, bytesOf(html))).toBe('Shift_JIS')
  })

  it('Content-Type の charset があれば <meta> は見ない（ヘッダ優先）', () => {
    const html = '<html><head><meta charset="EUC-JP"></head></html>'
    expect(detectCharset('text/html; charset=UTF-8', bytesOf(html))).toBe('UTF-8')
  })

  it('charset を含まない <meta> が先にあっても後続の <meta charset> を見つける', () => {
    const html =
      '<html><head><meta name="viewport" content="width=device-width"><meta charset="UTF-8"></head></html>'
    expect(detectCharset(null, bytesOf(html))).toBe('UTF-8')
  })

  it('<meta> が本文先頭 2KB より後ろにあれば見つからず utf-8 にフォールバックする', () => {
    const padding = ' '.repeat(2048)
    const html = `<html><head>${padding}<meta charset="EUC-JP"></head></html>`
    expect(detectCharset(null, bytesOf(html))).toBe('utf-8')
  })

  it('空のバイト列でも例外を投げず utf-8 を返す', () => {
    expect(detectCharset(null, new Uint8Array())).toBe('utf-8')
  })
})
