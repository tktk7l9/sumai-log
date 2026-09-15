import { describe, expect, it } from 'vitest'

import { PLATFORM_LABEL, detectPlatform, normalizeSocialUrls } from './social'

describe('detectPlatform', () => {
  it('ホスト名で判定し www. と大文字を無視する', () => {
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
  it('不明・不正は other', () => {
    expect(detectPlatform('https://example.com/')).toBe('other')
    expect(detectPlatform('not a url')).toBe('other')
    expect(PLATFORM_LABEL.other).toBe('リンク')
  })
})
describe('normalizeSocialUrls', () => {
  it('空白除去・空と非 http を除外・重複除去・10 件まで', () => {
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
