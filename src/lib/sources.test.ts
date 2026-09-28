import { describe, expect, it } from 'vitest'

import { groupSourcesByGenre, isAllowedAvatarUrl, parseYoutubeChannelUrl } from './sources'

type FakeSource = { genre: string; sortOrder: number; name: string }

describe('groupSourcesByGenre', () => {
  it('groups in the display order of SOURCE_GENRES and leaves out genres with 0 items', () => {
    const items: FakeSource[] = [
      { genre: 'money', sortOrder: 0, name: 'お金チャンネル' },
      { genre: 'candidates', sortOrder: 0, name: '候補チャンネル' },
    ]
    const groups = groupSourcesByGenre(items)
    expect(groups.map((g) => g.genre.id)).toEqual(['candidates', 'money'])
  })

  it('sorts by ascending sortOrder within a genre', () => {
    const items: FakeSource[] = [
      { genre: 'money', sortOrder: 2, name: 'B' },
      { genre: 'money', sortOrder: 1, name: 'A' },
    ]
    const groups = groupSourcesByGenre(items)
    expect(groups[0]?.items.map((i) => i.name)).toEqual(['A', 'B'])
  })

  it('sorts by name in dictionary order (Japanese kana order) when sortOrder is the same', () => {
    const items: FakeSource[] = [
      { genre: 'money', sortOrder: 0, name: 'いろは' },
      { genre: 'money', sortOrder: 0, name: 'あいう' },
    ]
    const groups = groupSourcesByGenre(items)
    expect(groups[0]?.items.map((i) => i.name)).toEqual(['あいう', 'いろは'])
  })

  it('ignores an unknown genre id (does not crash on data someone forgot to fix)', () => {
    const items: FakeSource[] = [{ genre: 'unknown', sortOrder: 0, name: 'X' }]
    expect(groupSourcesByGenre(items)).toEqual([])
  })

  it('returns empty for empty input', () => {
    expect(groupSourcesByGenre([])).toEqual([])
  })

  it('does not mutate the argument array', () => {
    const items: readonly FakeSource[] = Object.freeze([
      { genre: 'money', sortOrder: 2, name: 'B' },
      { genre: 'money', sortOrder: 1, name: 'A' },
    ])
    expect(() => groupSourcesByGenre(items)).not.toThrow()
    expect(items[0]?.name).toBe('B')
  })
})

describe('parseYoutubeChannelUrl', () => {
  it('reads /@handle', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/@example-house')).toEqual({
      handle: '@example-house',
    })
  })

  it('also reads youtube.com without www and with m. or music.', () => {
    expect(parseYoutubeChannelUrl('https://youtube.com/@example-house')).toEqual({
      handle: '@example-house',
    })
    expect(parseYoutubeChannelUrl('https://m.youtube.com/@example-house')).toEqual({
      handle: '@example-house',
    })
    expect(parseYoutubeChannelUrl('https://music.youtube.com/@example-house')).toEqual({
      handle: '@example-house',
    })
  })

  it('reads /channel/UC… (the 24-character shape of a real channel ID)', () => {
    const channelId = `UC${'a'.repeat(22)}`
    expect(parseYoutubeChannelUrl(`https://www.youtube.com/channel/${channelId}`)).toEqual({
      channelId,
    })
  })

  it('returns null when what follows /channel/ is not in the UC… shape', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/channel/not-a-channel-id')).toBeNull()
  })

  it('returns /c/<custom URL> as the handle (without @)', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/c/example-house')).toEqual({
      handle: 'example-house',
    })
  })

  it('returns /user/<legacy username> as the handle', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/user/exampleuser')).toEqual({
      handle: 'exampleuser',
    })
  })

  it('does not support youtu.be (a short domain for videos only)', () => {
    expect(parseYoutubeChannelUrl('https://youtu.be/@example-house')).toBeNull()
  })

  it('returns null for a host other than YouTube', () => {
    expect(parseYoutubeChannelUrl('https://example.com/@example-house')).toBeNull()
  })

  it('returns null for a video URL (/watch)', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  it('returns null when there is no path (the top page)', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/')).toBeNull()
  })

  it('returns null for /channel/ alone without an id', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/channel/')).toBeNull()
  })

  it('returns null for /c/ alone without a name', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/c/')).toBeNull()
  })

  it('does not accept @ alone (1 character) as a handle', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/@')).toBeNull()
  })

  it('returns null for a string that cannot be read as a URL', () => {
    expect(parseYoutubeChannelUrl('not a url')).toBeNull()
  })

  it('returns null for a scheme other than http/https', () => {
    expect(parseYoutubeChannelUrl('javascript:alert(1)')).toBeNull()
  })

  it('allows http', () => {
    expect(parseYoutubeChannelUrl('http://www.youtube.com/@example-house')).toEqual({
      handle: '@example-house',
    })
  })

  it('trims leading and trailing whitespace', () => {
    expect(parseYoutubeChannelUrl('  https://www.youtube.com/@example-house  ')).toEqual({
      handle: '@example-house',
    })
  })
})

describe('isAllowedAvatarUrl', () => {
  it('allows https on yt3.ggpht.com / yt3.googleusercontent.com / i.ytimg.com', () => {
    expect(isAllowedAvatarUrl('https://yt3.ggpht.com/abc=s900-c-k-c0x00ffffff-no-rj')).toBe(true)
    expect(isAllowedAvatarUrl('https://yt3.googleusercontent.com/abc')).toBe(true)
    expect(isAllowedAvatarUrl('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')).toBe(true)
  })

  it('rejects http (non-https)', () => {
    expect(isAllowedAvatarUrl('http://yt3.ggpht.com/abc')).toBe(false)
  })

  it('rejects a host outside the allowlist', () => {
    expect(isAllowedAvatarUrl('https://evil.example/avatar.jpg')).toBe(false)
  })

  it('rejects a string that cannot be read as a URL', () => {
    expect(isAllowedAvatarUrl('not a url')).toBe(false)
  })
})
