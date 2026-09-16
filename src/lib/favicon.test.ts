import { describe, expect, it } from 'vitest'

import { MAX_HTML_LENGTH, extForType, pickFaviconCandidates, sniffFaviconType } from './favicon'

const PAGE_URL = 'https://vendor.example.com/'

describe('pickFaviconCandidates', () => {
  it('pageUrl が URL として読めなければ空配列', () => {
    expect(pickFaviconCandidates('<link rel="icon" href="/a.png">', 'not a url')).toEqual([])
  })

  it('HTML が MAX_HTML_LENGTH を超えたら favicon.ico の保険だけ返す', () => {
    const huge = `<link rel="icon" href="/a.png">${'x'.repeat(MAX_HTML_LENGTH)}`
    expect(pickFaviconCandidates(huge, PAGE_URL)).toEqual([
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('<link> が無ければ favicon.ico の保険だけ返す', () => {
    expect(pickFaviconCandidates('<html><body>no links</body></html>', PAGE_URL)).toEqual([
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('rel が icon/shortcut icon 以外（stylesheet 等）は候補にしない', () => {
    const html = '<link rel="stylesheet" href="/style.css"><link rel="icon" href="/a.png">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/a.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('rel が無い <link> は候補にしない', () => {
    const html = '<link href="/a.png"><link rel="icon" href="/b.png">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/b.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('href が無い <link rel="icon"> は候補にしない', () => {
    const html = '<link rel="icon"><link rel="icon" href="/b.png">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/b.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('data: URL は候補にしない', () => {
    const html = '<link rel="icon" href="data:image/png;base64,AAAA">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('href が URL として解決できなければスキップする（他の候補は残す）', () => {
    const html = '<link rel="icon" href="http://"><link rel="icon" href="/ok.png">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/ok.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('相対パスは pageUrl 基準で絶対 URL に解決する', () => {
    const html = '<link rel="icon" href="./icons/a.png">'
    expect(pickFaviconCandidates(html, 'https://vendor.example.com/dir/page.html')).toEqual([
      'https://vendor.example.com/dir/icons/a.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('宣言サイズが大きい rel=icon を優先し、次に apple-touch-icon、最後に favicon.ico', () => {
    const html = [
      '<link rel="apple-touch-icon" href="/apple.png" sizes="180x180">',
      '<link rel="icon" href="/small.png" sizes="16x16">',
      '<link rel="icon" href="/large.png" sizes="32x32">',
      '<link rel="shortcut icon" href="/legacy.ico">',
    ].join('')
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/large.png',
      'https://vendor.example.com/small.png',
      'https://vendor.example.com/legacy.ico',
      'https://vendor.example.com/apple.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('拡張子 .svg の href は候補にしない（SVG は画像として受け付けない。stored XSS 対策）', () => {
    const html = [
      '<link rel="icon" href="/32.png" sizes="32x32">',
      '<link rel="icon" href="/icon.svg">',
    ].join('')
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/32.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('宣言が .svg だけなら favicon.ico の保険だけ残る', () => {
    const html = '<link rel="icon" href="/icon.svg"><link rel="apple-touch-icon" href="/apple.svg">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('.svg?query や #hash が付いていても候補にしない', () => {
    const html = '<link rel="icon" href="/icon.svg?v=2"><link rel="icon" href="/a.png">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/a.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('拡張子が .svg でなくても sizes="any" なら最優先扱いになる（マスクアイコン等）', () => {
    const html = [
      '<link rel="icon" href="/32.png" sizes="32x32">',
      '<link rel="icon" href="/mask-any.png" sizes="any">',
    ].join('')
    const result = pickFaviconCandidates(html, PAGE_URL)
    expect(result[0]).toBe('https://vendor.example.com/mask-any.png')
    expect(result[1]).toBe('https://vendor.example.com/32.png')
  })

  it('apple-touch-icon-precomposed も apple-touch-icon と同じ扱い', () => {
    const html = '<link rel="apple-touch-icon-precomposed" href="/apple-old.png">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/apple-old.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('同じ URL が重複したら最初の出現だけ残す（明示的な favicon.ico 宣言も保険と重複除去される）', () => {
    const html = '<link rel="icon" href="/favicon.ico">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('属性はダブルクォート・シングルクォート・無クォートのいずれでも読める', () => {
    const html = [
      `<link rel='icon' href='/single.png'>`,
      `<link rel=icon href=/bare.png sizes=32x32>`,
    ].join('')
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/bare.png',
      'https://vendor.example.com/single.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('sizes が "16x16 32x32" のように複数並んでいれば最大値を採る', () => {
    const html = '<link rel="icon" href="/multi.png" sizes="16x16 48x48 32x32">'
    const html2 = '<link rel="icon" href="/single-size.png" sizes="20x20">'
    const result = pickFaviconCandidates(html + html2, PAGE_URL)
    expect(result[0]).toBe('https://vendor.example.com/multi.png')
    expect(result[1]).toBe('https://vendor.example.com/single-size.png')
  })

  it('sizes が数値の形式でなければ 0 扱い（宣言なしと同順位）', () => {
    const html = '<link rel="icon" href="/weird.png" sizes="not-a-size">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/weird.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('宣言された候補が多くても上位 5 件 + favicon.ico の保険で最大 6 件に切る（1 業者あたりの外向き fetch 数を有限に保つ）', () => {
    const html = Array.from(
      { length: 10 },
      (_, i) => `<link rel="icon" href="/icon-${i}.png" sizes="${16 + i}x${16 + i}">`,
    ).join('')
    const result = pickFaviconCandidates(html, PAGE_URL)
    expect(result).toHaveLength(6)
    // sizes 降順なので後ろ（大きい i）が優先される
    expect(result).toEqual([
      'https://vendor.example.com/icon-9.png',
      'https://vendor.example.com/icon-8.png',
      'https://vendor.example.com/icon-7.png',
      'https://vendor.example.com/icon-6.png',
      'https://vendor.example.com/icon-5.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('上限を超える宣言があっても favicon.ico の保険は必ず含まれる（宣言だけで 6 件ちょうどでも保険が押し出されない）', () => {
    const html = Array.from(
      { length: 6 },
      (_, i) => `<link rel="icon" href="/icon-${i}.png">`,
    ).join('')
    const result = pickFaviconCandidates(html, PAGE_URL)
    expect(result).toContain('https://vendor.example.com/favicon.ico')
    expect(result).toHaveLength(6)
  })
})

describe('sniffFaviconType', () => {
  it('PNG のマジックバイトを判定する', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    expect(sniffFaviconType(bytes)).toBe('image/png')
  })

  it('ICO のマジックバイトを判定する', () => {
    expect(sniffFaviconType(new Uint8Array([0x00, 0x00, 0x01, 0x00, 1, 0]))).toBe('image/x-icon')
  })

  it('JPEG のマジックバイトを判定する', () => {
    expect(sniffFaviconType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg')
  })

  it('WEBP（RIFF….WEBP）を判定する', () => {
    const webp = new Uint8Array(12)
    webp.set([0x52, 0x49, 0x46, 0x46], 0)
    webp.set([0x57, 0x45, 0x42, 0x50], 8)
    expect(sniffFaviconType(webp)).toBe('image/webp')
  })

  it('RIFF だが WEBP マーカーが無ければ webp 判定しない', () => {
    const riffOnly = new Uint8Array(12)
    riffOnly.set([0x52, 0x49, 0x46, 0x46], 0)
    riffOnly.set([0x41, 0x56, 0x49, 0x20], 8) // 'AVI '
    expect(sniffFaviconType(riffOnly)).toBeNull()
  })

  it('SVG は意図的に判定しない（null）。stored XSS 対策で画像として受け付けない', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(sniffFaviconType(svg)).toBeNull()
    const svgWithXmlDecl = new TextEncoder().encode('<?xml version="1.0"?>\n<svg></svg>')
    expect(sniffFaviconType(svgWithXmlDecl)).toBeNull()
  })

  it('どれにも一致しなければ null（短いバイト列・非対応形式）', () => {
    expect(sniffFaviconType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull()
    expect(sniffFaviconType(new Uint8Array([]))).toBeNull()
    expect(sniffFaviconType(new Uint8Array([0xff]))).toBeNull()
  })
})

describe('extForType', () => {
  it('画像形式ごとに拡張子を返す', () => {
    expect(extForType('image/png')).toBe('png')
    expect(extForType('image/x-icon')).toBe('ico')
    expect(extForType('image/jpeg')).toBe('jpg')
    expect(extForType('image/webp')).toBe('webp')
  })
})
