import { describe, expect, it } from 'vitest'

import { MAX_HTML_LENGTH, extForType, pickFaviconCandidates, sniffFaviconType } from './favicon'

const PAGE_URL = 'https://vendor.example.com/'

describe('pickFaviconCandidates', () => {
  it('returns an empty array when pageUrl cannot be read as a URL', () => {
    expect(pickFaviconCandidates('<link rel="icon" href="/a.png">', 'not a url')).toEqual([])
  })

  it('returns only the favicon.ico fallback when the HTML exceeds MAX_HTML_LENGTH', () => {
    const huge = `<link rel="icon" href="/a.png">${'x'.repeat(MAX_HTML_LENGTH)}`
    expect(pickFaviconCandidates(huge, PAGE_URL)).toEqual([
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('returns only the favicon.ico fallback when there is no <link>', () => {
    expect(pickFaviconCandidates('<html><body>no links</body></html>', PAGE_URL)).toEqual([
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('does not make a rel other than icon/shortcut icon (stylesheet etc.) a candidate', () => {
    const html = '<link rel="stylesheet" href="/style.css"><link rel="icon" href="/a.png">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/a.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('does not make a <link> without rel a candidate', () => {
    const html = '<link href="/a.png"><link rel="icon" href="/b.png">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/b.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('does not make a <link rel="icon"> without href a candidate', () => {
    const html = '<link rel="icon"><link rel="icon" href="/b.png">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/b.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('does not make a data: URL a candidate', () => {
    const html = '<link rel="icon" href="data:image/png;base64,AAAA">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('skips an href that cannot be resolved as a URL (keeps the other candidates)', () => {
    const html = '<link rel="icon" href="http://"><link rel="icon" href="/ok.png">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/ok.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('resolves a relative path to an absolute URL based on pageUrl', () => {
    const html = '<link rel="icon" href="./icons/a.png">'
    expect(pickFaviconCandidates(html, 'https://vendor.example.com/dir/page.html')).toEqual([
      'https://vendor.example.com/dir/icons/a.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('prefers rel=icon with a larger declared size, then apple-touch-icon, and favicon.ico last', () => {
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

  it('does not make an href with the .svg extension a candidate (SVG is not accepted as an image; stored XSS countermeasure)', () => {
    const html = [
      '<link rel="icon" href="/32.png" sizes="32x32">',
      '<link rel="icon" href="/icon.svg">',
    ].join('')
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/32.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('keeps only the favicon.ico fallback when the only declaration is .svg', () => {
    const html = '<link rel="icon" href="/icon.svg"><link rel="apple-touch-icon" href="/apple.svg">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('does not make it a candidate even with .svg?query or #hash attached', () => {
    const html = '<link rel="icon" href="/icon.svg?v=2"><link rel="icon" href="/a.png">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/a.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('treats sizes="any" as top priority even when the extension is not .svg (mask icons etc.)', () => {
    const html = [
      '<link rel="icon" href="/32.png" sizes="32x32">',
      '<link rel="icon" href="/mask-any.png" sizes="any">',
    ].join('')
    const result = pickFaviconCandidates(html, PAGE_URL)
    expect(result[0]).toBe('https://vendor.example.com/mask-any.png')
    expect(result[1]).toBe('https://vendor.example.com/32.png')
  })

  it('treats apple-touch-icon-precomposed the same as apple-touch-icon', () => {
    const html = '<link rel="apple-touch-icon-precomposed" href="/apple-old.png">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/apple-old.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('keeps only the first occurrence of a duplicated URL (an explicit favicon.ico declaration is deduplicated against the fallback too)', () => {
    const html = '<link rel="icon" href="/favicon.ico">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('reads attributes in double quotes, single quotes or no quotes', () => {
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

  it('takes the largest value when sizes lists several, such as "16x16 32x32"', () => {
    const html = '<link rel="icon" href="/multi.png" sizes="16x16 48x48 32x32">'
    const html2 = '<link rel="icon" href="/single-size.png" sizes="20x20">'
    const result = pickFaviconCandidates(html + html2, PAGE_URL)
    expect(result[0]).toBe('https://vendor.example.com/multi.png')
    expect(result[1]).toBe('https://vendor.example.com/single-size.png')
  })

  it('treats sizes that is not in numeric form as 0 (same rank as no declaration)', () => {
    const html = '<link rel="icon" href="/weird.png" sizes="not-a-size">'
    expect(pickFaviconCandidates(html, PAGE_URL)).toEqual([
      'https://vendor.example.com/weird.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('cuts to at most 6 (top 5 + the favicon.ico fallback) even with many declared candidates (keeps outbound fetches per vendor finite)', () => {
    const html = Array.from(
      { length: 10 },
      (_, i) => `<link rel="icon" href="/icon-${i}.png" sizes="${16 + i}x${16 + i}">`,
    ).join('')
    const result = pickFaviconCandidates(html, PAGE_URL)
    expect(result).toHaveLength(6)
    // Sorted by sizes descending, so the later ones (larger i) take priority
    expect(result).toEqual([
      'https://vendor.example.com/icon-9.png',
      'https://vendor.example.com/icon-8.png',
      'https://vendor.example.com/icon-7.png',
      'https://vendor.example.com/icon-6.png',
      'https://vendor.example.com/icon-5.png',
      'https://vendor.example.com/favicon.ico',
    ])
  })

  it('always includes the favicon.ico fallback even when declarations exceed the limit (exactly 6 declarations do not push the fallback out)', () => {
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
  it('detects the PNG magic bytes', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    expect(sniffFaviconType(bytes)).toBe('image/png')
  })

  it('detects the ICO magic bytes', () => {
    expect(sniffFaviconType(new Uint8Array([0x00, 0x00, 0x01, 0x00, 1, 0]))).toBe('image/x-icon')
  })

  it('detects the JPEG magic bytes', () => {
    expect(sniffFaviconType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg')
  })

  it('detects WEBP (RIFF….WEBP)', () => {
    const webp = new Uint8Array(12)
    webp.set([0x52, 0x49, 0x46, 0x46], 0)
    webp.set([0x57, 0x45, 0x42, 0x50], 8)
    expect(sniffFaviconType(webp)).toBe('image/webp')
  })

  it('does not detect webp for RIFF without the WEBP marker', () => {
    const riffOnly = new Uint8Array(12)
    riffOnly.set([0x52, 0x49, 0x46, 0x46], 0)
    riffOnly.set([0x41, 0x56, 0x49, 0x20], 8) // 'AVI '
    expect(sniffFaviconType(riffOnly)).toBeNull()
  })

  it('deliberately does not detect SVG (null). Not accepted as an image as a stored XSS countermeasure', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(sniffFaviconType(svg)).toBeNull()
    const svgWithXmlDecl = new TextEncoder().encode('<?xml version="1.0"?>\n<svg></svg>')
    expect(sniffFaviconType(svgWithXmlDecl)).toBeNull()
  })

  it('returns null when nothing matches (short byte sequence, unsupported format)', () => {
    expect(sniffFaviconType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull()
    expect(sniffFaviconType(new Uint8Array([]))).toBeNull()
    expect(sniffFaviconType(new Uint8Array([0xff]))).toBeNull()
  })
})

describe('extForType', () => {
  it('returns the extension for each image format', () => {
    expect(extForType('image/png')).toBe('png')
    expect(extForType('image/x-icon')).toBe('ico')
    expect(extForType('image/jpeg')).toBe('jpg')
    expect(extForType('image/webp')).toBe('webp')
  })
})
