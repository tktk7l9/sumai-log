import { describe, expect, it } from 'vitest'

import {
  canonicalYouTubeUrl,
  findYouTubeUrl,
  isYouTubeHost,
  parseYouTubeId,
  youtubeThumbnailUrl,
} from './youtube'

const ID = 'dQw4w9WgXcQ'

describe('parseYouTubeId', () => {
  it('reads a youtu.be short link (with the si parameter)', () => {
    expect(parseYouTubeId(`https://youtu.be/${ID}?si=abcDEF123`)).toBe(ID)
  })

  it('reads youtube.com/watch (with the t parameter)', () => {
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}&t=30s`)).toBe(ID)
  })

  it('reads /shorts/', () => {
    expect(parseYouTubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID)
  })

  it('reads /embed/', () => {
    expect(parseYouTubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID)
  })

  it('reads /live/', () => {
    expect(parseYouTubeId(`https://www.youtube.com/live/${ID}`)).toBe(ID)
  })

  it('reads m.youtube.com', () => {
    expect(parseYouTubeId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it('reads music.youtube.com', () => {
    expect(parseYouTubeId(`https://music.youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it('also reads youtube.com without www', () => {
    expect(parseYouTubeId(`https://youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it('trims leading and trailing whitespace', () => {
    expect(parseYouTubeId(`  https://youtu.be/${ID}  `)).toBe(ID)
  })

  it('returns null for other hosts', () => {
    expect(parseYouTubeId('https://example.com/watch?v=abcdefghijk')).toBeNull()
  })

  it('returns null for a spoofed host that merely contains youtube.com (no suffix match)', () => {
    expect(parseYouTubeId(`https://www.youtube.com.evil.example/watch?v=${ID}`)).toBeNull()
  })

  it('returns null for a spoof that only embeds a youtu.be URL in the path (judged by host)', () => {
    expect(parseYouTubeId(`https://evil.example/https://youtu.be/${ID}`)).toBeNull()
  })

  it('returns null for an id that is not 11 characters', () => {
    expect(parseYouTubeId('https://youtu.be/abcdefghij')).toBeNull() // 10 characters
  })

  it('returns null when youtu.be has no id', () => {
    expect(parseYouTubeId('https://youtu.be/')).toBeNull()
  })

  it('returns null for a channel page (a path without a video id)', () => {
    expect(parseYouTubeId('https://www.youtube.com/@channel')).toBeNull()
  })

  it('returns null for a string without a protocol, which cannot be parsed as a URL', () => {
    expect(parseYouTubeId('youtube.com/@channel')).toBeNull()
  })

  it('allows http', () => {
    expect(parseYouTubeId(`http://www.youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it('returns null for schemes other than http/https', () => {
    expect(parseYouTubeId(`file://youtube.com/watch?v=${ID}`)).toBeNull()
    expect(parseYouTubeId(`ftp://youtube.com/watch?v=${ID}`)).toBeNull()
    expect(parseYouTubeId(`ws://youtube.com/watch?v=${ID}`)).toBeNull()
    expect(parseYouTubeId('javascript:alert(1)')).toBeNull()
    expect(parseYouTubeId('data:text/plain,hello')).toBeNull()
  })

  it('returns null for an empty string or whitespace', () => {
    expect(parseYouTubeId('')).toBeNull()
    expect(parseYouTubeId('   ')).toBeNull()
  })

  it('returns null when watch has no v parameter', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch')).toBeNull()
  })

  it('returns null when shorts/embed/live has no id', () => {
    expect(parseYouTubeId('https://www.youtube.com/shorts')).toBeNull()
  })
})

describe('canonicalYouTubeUrl', () => {
  it('builds the watch URL', () => {
    expect(canonicalYouTubeUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`)
  })
})

describe('youtubeThumbnailUrl', () => {
  it('builds the large thumbnail URL (480x360) unless told otherwise', () => {
    expect(youtubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`)
    expect(youtubeThumbnailUrl(ID, 'large')).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`)
  })

  it('builds the small 16:9 thumbnail URL (320x180) for the pictures of list cards', () => {
    expect(youtubeThumbnailUrl(ID, 'small')).toBe(`https://i.ytimg.com/vi/${ID}/mqdefault.jpg`)
  })
})

describe('isYouTubeHost', () => {
  it('returns true for YouTube hosts', () => {
    expect(isYouTubeHost('youtube.com')).toBe(true)
    expect(isYouTubeHost('www.youtube.com')).toBe(true)
    expect(isYouTubeHost('m.youtube.com')).toBe(true)
    expect(isYouTubeHost('music.youtube.com')).toBe(true)
    expect(isYouTubeHost('youtu.be')).toBe(true)
  })

  it('matches even with mixed case', () => {
    expect(isYouTubeHost('YouTube.com')).toBe(true)
  })

  it('returns false for anything else', () => {
    expect(isYouTubeHost('vimeo.com')).toBe(false)
  })
})

describe('findYouTubeUrl', () => {
  it('returns a copied share link as it is', () => {
    expect(findYouTubeUrl(`https://youtu.be/${ID}?si=abcDEF123`)).toBe(
      `https://youtu.be/${ID}?si=abcDEF123`,
    )
  })

  it('picks the link out of a title and the text around it', () => {
    expect(findYouTubeUrl(`平屋のルームツアー\nhttps://youtu.be/${ID}?si=abc を観た`)).toBe(
      `https://youtu.be/${ID}?si=abc`,
    )
  })

  it('stops at Japanese brackets and punctuation that follow the link', () => {
    expect(findYouTubeUrl(`「https://www.youtube.com/watch?v=${ID}」、あとで観る`)).toBe(
      `https://www.youtube.com/watch?v=${ID}`,
    )
  })

  it('skips links to other sites and takes the first YouTube video', () => {
    expect(
      findYouTubeUrl(`https://example.com/a https://youtu.be/${ID} https://youtu.be/AAAAAAAAAAA`),
    ).toBe(`https://youtu.be/${ID}`)
  })

  it('returns null when there is no YouTube video link', () => {
    expect(findYouTubeUrl('')).toBeNull()
    expect(findYouTubeUrl('買い物メモ 牛乳')).toBeNull()
    expect(findYouTubeUrl('https://www.youtube.com/@channel')).toBeNull()
  })

  it('looks only at the beginning of a very long text', () => {
    expect(findYouTubeUrl(`${'あ'.repeat(5000)} https://youtu.be/${ID}`)).toBeNull()
  })
})
