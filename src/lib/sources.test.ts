import { describe, expect, it } from 'vitest'

import { groupSourcesByGenre, isAllowedAvatarUrl, parseYoutubeChannelUrl } from './sources'

type FakeSource = { genre: string; sortOrder: number; name: string }

describe('groupSourcesByGenre', () => {
  it('SOURCE_GENRES の表示順にまとめ、0 件のジャンルは含めない', () => {
    const items: FakeSource[] = [
      { genre: 'money', sortOrder: 0, name: 'お金チャンネル' },
      { genre: 'candidates', sortOrder: 0, name: '候補チャンネル' },
    ]
    const groups = groupSourcesByGenre(items)
    expect(groups.map((g) => g.genre.id)).toEqual(['candidates', 'money'])
  })

  it('ジャンル内は sortOrder 昇順', () => {
    const items: FakeSource[] = [
      { genre: 'money', sortOrder: 2, name: 'B' },
      { genre: 'money', sortOrder: 1, name: 'A' },
    ]
    const groups = groupSourcesByGenre(items)
    expect(groups[0]?.items.map((i) => i.name)).toEqual(['A', 'B'])
  })

  it('sortOrder が同じなら name の辞書順（あいうえお順）', () => {
    const items: FakeSource[] = [
      { genre: 'money', sortOrder: 0, name: 'いろは' },
      { genre: 'money', sortOrder: 0, name: 'あいう' },
    ]
    const groups = groupSourcesByGenre(items)
    expect(groups[0]?.items.map((i) => i.name)).toEqual(['あいう', 'いろは'])
  })

  it('未知のジャンル id は無視する（データの直し忘れで落ちない）', () => {
    const items: FakeSource[] = [{ genre: 'unknown', sortOrder: 0, name: 'X' }]
    expect(groupSourcesByGenre(items)).toEqual([])
  })

  it('空なら空', () => {
    expect(groupSourcesByGenre([])).toEqual([])
  })

  it('引数の配列を書き換えない', () => {
    const items: readonly FakeSource[] = Object.freeze([
      { genre: 'money', sortOrder: 2, name: 'B' },
      { genre: 'money', sortOrder: 1, name: 'A' },
    ])
    expect(() => groupSourcesByGenre(items)).not.toThrow()
    expect(items[0]?.name).toBe('B')
  })
})

describe('parseYoutubeChannelUrl', () => {
  it('/@handle を読む', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/@example-house')).toEqual({
      handle: '@example-house',
    })
  })

  it('www 無し・m./music. の youtube.com も読む', () => {
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

  it('/channel/UC… を読む（24 文字の実チャンネル ID 形）', () => {
    const channelId = `UC${'a'.repeat(22)}`
    expect(parseYoutubeChannelUrl(`https://www.youtube.com/channel/${channelId}`)).toEqual({
      channelId,
    })
  })

  it('/channel/ の後ろが UC… の形でなければ null', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/channel/not-a-channel-id')).toBeNull()
  })

  it('/c/カスタムURL は handle として返す（@ は付かない）', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/c/example-house')).toEqual({
      handle: 'example-house',
    })
  })

  it('/user/レガシーユーザー名 は handle として返す', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/user/exampleuser')).toEqual({
      handle: 'exampleuser',
    })
  })

  it('youtu.be は対応外（動画専用の短縮ドメイン）', () => {
    expect(parseYoutubeChannelUrl('https://youtu.be/@example-house')).toBeNull()
  })

  it('YouTube 以外のホストは null', () => {
    expect(parseYoutubeChannelUrl('https://example.com/@example-house')).toBeNull()
  })

  it('動画の URL（/watch）は null', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  it('パスが無い（トップページ）は null', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/')).toBeNull()
  })

  it('/channel/ だけで id が無ければ null', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/channel/')).toBeNull()
  })

  it('/c/ だけで名前が無ければ null', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/c/')).toBeNull()
  })

  it('@ だけ（1 文字）は handle として認めない', () => {
    expect(parseYoutubeChannelUrl('https://www.youtube.com/@')).toBeNull()
  })

  it('URL として読めない文字列は null', () => {
    expect(parseYoutubeChannelUrl('not a url')).toBeNull()
  })

  it('http/https 以外のスキームは null', () => {
    expect(parseYoutubeChannelUrl('javascript:alert(1)')).toBeNull()
  })

  it('http は許可する', () => {
    expect(parseYoutubeChannelUrl('http://www.youtube.com/@example-house')).toEqual({
      handle: '@example-house',
    })
  })

  it('前後の空白は trim する', () => {
    expect(parseYoutubeChannelUrl('  https://www.youtube.com/@example-house  ')).toEqual({
      handle: '@example-house',
    })
  })
})

describe('isAllowedAvatarUrl', () => {
  it('yt3.ggpht.com / yt3.googleusercontent.com / i.ytimg.com の https は許可', () => {
    expect(isAllowedAvatarUrl('https://yt3.ggpht.com/abc=s900-c-k-c0x00ffffff-no-rj')).toBe(true)
    expect(isAllowedAvatarUrl('https://yt3.googleusercontent.com/abc')).toBe(true)
    expect(isAllowedAvatarUrl('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')).toBe(true)
  })

  it('http（非 https）は拒否', () => {
    expect(isAllowedAvatarUrl('http://yt3.ggpht.com/abc')).toBe(false)
  })

  it('許可リスト外のホストは拒否', () => {
    expect(isAllowedAvatarUrl('https://evil.example/avatar.jpg')).toBe(false)
  })

  it('URL として読めない文字列は拒否', () => {
    expect(isAllowedAvatarUrl('not a url')).toBe(false)
  })
})
