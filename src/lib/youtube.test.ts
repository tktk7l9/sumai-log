import { describe, expect, it } from 'vitest'

import { canonicalYouTubeUrl, isYouTubeHost, parseYouTubeId, youtubeThumbnailUrl } from './youtube'

const ID = 'dQw4w9WgXcQ'

describe('parseYouTubeId', () => {
  it('youtu.be の短縮リンク（si パラメータ付き）を読む', () => {
    expect(parseYouTubeId(`https://youtu.be/${ID}?si=abcDEF123`)).toBe(ID)
  })

  it('youtube.com/watch（t パラメータ付き）を読む', () => {
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}&t=30s`)).toBe(ID)
  })

  it('/shorts/ を読む', () => {
    expect(parseYouTubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID)
  })

  it('/embed/ を読む', () => {
    expect(parseYouTubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID)
  })

  it('/live/ を読む', () => {
    expect(parseYouTubeId(`https://www.youtube.com/live/${ID}`)).toBe(ID)
  })

  it('m.youtube.com を読む', () => {
    expect(parseYouTubeId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it('music.youtube.com を読む', () => {
    expect(parseYouTubeId(`https://music.youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it('www 無しの youtube.com も読む', () => {
    expect(parseYouTubeId(`https://youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it('前後の空白は trim する', () => {
    expect(parseYouTubeId(`  https://youtu.be/${ID}  `)).toBe(ID)
  })

  it('他ホストは null', () => {
    expect(parseYouTubeId('https://example.com/watch?v=abcdefghijk')).toBeNull()
  })

  it('11 文字でない id は null', () => {
    expect(parseYouTubeId('https://youtu.be/abcdefghij')).toBeNull() // 10 文字
  })

  it('youtu.be の id が無ければ null', () => {
    expect(parseYouTubeId('https://youtu.be/')).toBeNull()
  })

  it('チャンネルページ（動画 id を含まないパス）は null', () => {
    expect(parseYouTubeId('https://www.youtube.com/@channel')).toBeNull()
  })

  it('プロトコル無しの文字列は URL として解釈できず null', () => {
    expect(parseYouTubeId('youtube.com/@channel')).toBeNull()
  })

  it('空文字/空白は null', () => {
    expect(parseYouTubeId('')).toBeNull()
    expect(parseYouTubeId('   ')).toBeNull()
  })

  it('watch に v パラメータが無ければ null', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch')).toBeNull()
  })

  it('shorts/embed/live に id が無ければ null', () => {
    expect(parseYouTubeId('https://www.youtube.com/shorts')).toBeNull()
  })
})

describe('canonicalYouTubeUrl', () => {
  it('watch URL を組み立てる', () => {
    expect(canonicalYouTubeUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`)
  })
})

describe('youtubeThumbnailUrl', () => {
  it('サムネイル URL を組み立てる', () => {
    expect(youtubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`)
  })
})

describe('isYouTubeHost', () => {
  it('YouTube 系ホストは true', () => {
    expect(isYouTubeHost('youtube.com')).toBe(true)
    expect(isYouTubeHost('www.youtube.com')).toBe(true)
    expect(isYouTubeHost('m.youtube.com')).toBe(true)
    expect(isYouTubeHost('music.youtube.com')).toBe(true)
    expect(isYouTubeHost('youtu.be')).toBe(true)
  })

  it('大文字混じりでも判定する', () => {
    expect(isYouTubeHost('YouTube.com')).toBe(true)
  })

  it('それ以外は false', () => {
    expect(isYouTubeHost('vimeo.com')).toBe(false)
  })
})
