import { describe, expect, it } from 'vitest'

import { PLATFORM_LABEL, detectPlatform, normalizeSocialUrls } from './social'

describe('detectPlatform', () => {
  it('detects by hostname and ignores www. and uppercase', () => {
    expect(detectPlatform('https://www.instagram.com/example/')).toBe('instagram')
    expect(detectPlatform('https://x.com/Example_')).toBe('x')
    expect(detectPlatform('https://twitter.com/example')).toBe('x')
    expect(detectPlatform('https://www.youtube.com/@example')).toBe('youtube')
    expect(detectPlatform('https://youtu.be/abc')).toBe('youtube')
    expect(detectPlatform('https://www.facebook.com/example/')).toBe('facebook')
    expect(detectPlatform('https://www.tiktok.com/@example')).toBe('tiktok')
    expect(detectPlatform('https://lin.ee/abc')).toBe('line')
    expect(detectPlatform('https://www.threads.net/@example')).toBe('threads')
    expect(detectPlatform('https://note.com/example')).toBe('note')
    expect(detectPlatform('HTTPS://WWW.INSTAGRAM.COM/x')).toBe('instagram')
  })
  it('returns other for unknown or invalid input', () => {
    expect(detectPlatform('https://example.com/')).toBe('other')
    expect(detectPlatform('not a url')).toBe('other')
    expect(PLATFORM_LABEL.other).toBe('リンク')
  })
})
describe('normalizeSocialUrls', () => {
  it('trims whitespace, excludes empty and non-http values, removes duplicates, and keeps up to 10', () => {
    expect(
      normalizeSocialUrls([
        ' https://x.com/a ',
        '',
        'ftp://x',
        'https://x.com/a',
        'https://note.com/b',
      ]),
    ).toEqual(['https://x.com/a', 'https://note.com/b'])
    expect(
      normalizeSocialUrls(Array.from({ length: 12 }, (_, i) => `https://example.com/${i}`)),
    ).toHaveLength(10)
  })
})
