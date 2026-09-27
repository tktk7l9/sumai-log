import { describe, expect, it } from 'vitest'

import {
  FEED_ACTION_LABEL,
  FEED_KIND_LABEL,
  feedSentence,
  groupFeedByDay,
  mergeFeed,
  type FeedItem,
} from './feed'

const item = (
  kind: FeedItem['kind'],
  id: string,
  at: string,
  action: FeedItem['action'] = 'add',
): FeedItem => ({
  kind,
  id,
  title: id,
  action,
  at,
  by: 'owner@example.com',
  href: { to: `/records/${id}` },
})

describe('mergeFeed', () => {
  it('sorts by at, newest first', () => {
    const groups = [
      [item('visit', 'a', '2030-01-01T00:00:00Z')],
      [item('event', 'b', '2030-01-03T00:00:00Z')],
      [item('comment', 'c', '2030-01-02T00:00:00Z')],
    ]
    expect(mergeFeed(groups, 10).map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('is stable at the same time by kind order (visit record -> event -> vendor -> property -> place -> video -> source -> comment -> photo)', () => {
    const at = '2030-01-01T00:00:00Z'
    const groups = [
      [item('photo', 'photo', at), item('video', 'video', at), item('visit', 'visit', at)],
      [item('comment', 'comment', at), item('event', 'event', at), item('source', 'source', at)],
    ]
    expect(mergeFeed(groups, 10).map((i) => i.kind)).toEqual([
      'visit',
      'event',
      'video',
      'source',
      'comment',
      'photo',
    ])
  })

  it('narrows down to limit items', () => {
    const groups = [
      [
        item('visit', 'a', '2030-01-01T00:00:00Z'),
        item('visit', 'b', '2030-01-02T00:00:00Z'),
        item('visit', 'c', '2030-01-03T00:00:00Z'),
      ],
    ]
    expect(mergeFeed(groups, 2).map((i) => i.id)).toEqual(['c', 'b'])
  })

  it('returns empty for empty', () => {
    expect(mergeFeed([], 10)).toEqual([])
    expect(mergeFeed([[]], 10)).toEqual([])
  })

  it('returns empty when limit is 0 or less (does not pass a negative number straight to slice)', () => {
    const groups = [
      [item('visit', 'a', '2030-01-01T00:00:00Z'), item('visit', 'b', '2030-01-02T00:00:00Z')],
    ]
    expect(mergeFeed(groups, 0)).toEqual([])
    expect(mergeFeed(groups, -1)).toEqual([])
  })

  it('treats an item with an unreadable at as the oldest (does not drop it from the feed)', () => {
    const groups = [
      [item('visit', 'bad', 'invalid'), item('visit', 'good', '2030-01-01T00:00:00Z')],
    ]
    expect(mergeFeed(groups, 10).map((i) => i.id)).toEqual(['good', 'bad'])
  })

  it('passes an item with href.search through as is (for the event navigation to /calendar)', () => {
    const withSearch: FeedItem = {
      kind: 'event',
      id: 'e1',
      title: 'イベント',
      action: 'add',
      at: '2030-01-01T00:00:00Z',
      by: 'owner@example.com',
      href: { to: '/calendar', search: { d: '2030-01-01' } },
    }
    expect(mergeFeed([[withSearch]], 10)).toEqual([withSearch])
  })

  it('does not mutate the input arrays or items', () => {
    const groupA: readonly FeedItem[] = Object.freeze([item('visit', 'a', '2030-01-02T00:00:00Z')])
    const groupB: readonly FeedItem[] = Object.freeze([item('event', 'b', '2030-01-01T00:00:00Z')])
    const groups = Object.freeze([groupA, groupB])

    expect(() => mergeFeed(groups, 10)).not.toThrow()
    expect(groupA[0]?.id).toBe('a')
    expect(groupB[0]?.id).toBe('b')
    expect(groups[0]).toBe(groupA)
  })
})

describe('FEED_KIND_LABEL', () => {
  it('has a Japanese label for every kind', () => {
    expect(FEED_KIND_LABEL).toEqual({
      visit: '見学記録',
      event: '予定',
      vendor: '業者',
      property: '物件',
      place: '場所',
      video: '動画',
      comment: 'コメント',
      photo: '写真',
      source: '情報源',
    })
  })
})

describe('FEED_ACTION_LABEL', () => {
  it('has a Japanese label for add/update', () => {
    expect(FEED_ACTION_LABEL).toEqual({ add: '追加', update: '更新' })
  })
})

describe('groupFeedByDay', () => {
  it('groups by at (the JST date key) and orders days by first appearance (newer day first)', () => {
    const items = [
      item('event', 'b', '2030-01-02T20:00:00Z'), // JST 2030-01-03
      item('visit', 'a', '2030-01-02T00:00:00Z'), // JST 2030-01-02
      item('vendor', 'c', '2030-01-01T23:00:00Z'), // JST 2030-01-02 (grouped into the same day)
    ]
    const groups = groupFeedByDay(items)
    expect(groups.map((g) => g.day)).toEqual(['2030-01-03', '2030-01-02'])
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['b'])
    expect(groups[1]?.items.map((i) => i.id)).toEqual(['a', 'c'])
  })

  it('groups consecutive items of the same day into 1 group', () => {
    const items = [
      item('visit', 'a', '2030-01-02T00:00:00Z'),
      item('event', 'b', '2030-01-02T10:00:00Z'),
    ]
    const groups = groupFeedByDay(items)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toEqual({ day: '2030-01-02', items: [items[0], items[1]] })
  })

  it('returns empty for empty', () => {
    expect(groupFeedByDay([])).toEqual([])
  })
})

describe('feedSentence', () => {
  it('visit: add', () => {
    const i: FeedItem = { ...item('visit', 'v1', '2030-01-01T00:00:00Z'), title: 'ギャラリーA' }
    expect(feedSentence(i)).toEqual({
      before: '見学記録「',
      link: 'ギャラリーA',
      after: '」を追加',
    })
  })

  it('visit: update', () => {
    const i: FeedItem = {
      ...item('visit', 'v1', '2030-01-01T00:00:00Z', 'update'),
      title: 'ギャラリーA',
    }
    expect(feedSentence(i)).toEqual({
      before: '見学記録「',
      link: 'ギャラリーA',
      after: '」を更新',
    })
  })

  it('event: add/update', () => {
    const add: FeedItem = { ...item('event', 'e1', '2030-01-01T00:00:00Z'), title: '内覧会' }
    const update: FeedItem = {
      ...item('event', 'e1', '2030-01-01T00:00:00Z', 'update'),
      title: '内覧会',
    }
    expect(feedSentence(add)).toEqual({ before: '予定「', link: '内覧会', after: '」を追加' })
    expect(feedSentence(update)).toEqual({ before: '予定「', link: '内覧会', after: '」を更新' })
  })

  it('vendor: add/update', () => {
    const add: FeedItem = { ...item('vendor', 've1', '2030-01-01T00:00:00Z'), title: '甲建設' }
    const update: FeedItem = {
      ...item('vendor', 've1', '2030-01-01T00:00:00Z', 'update'),
      title: '甲建設',
    }
    expect(feedSentence(add)).toEqual({ before: '業者「', link: '甲建設', after: '」を追加' })
    expect(feedSentence(update)).toEqual({ before: '業者「', link: '甲建設', after: '」を更新' })
  })

  it('property: add/update', () => {
    const add: FeedItem = {
      ...item('property', 'p1', '2030-01-01T00:00:00Z'),
      title: 'ワイズマンション',
    }
    const update: FeedItem = {
      ...item('property', 'p1', '2030-01-01T00:00:00Z', 'update'),
      title: 'ワイズマンション',
    }
    expect(feedSentence(add)).toEqual({
      before: '物件「',
      link: 'ワイズマンション',
      after: '」を追加',
    })
    expect(feedSentence(update)).toEqual({
      before: '物件「',
      link: 'ワイズマンション',
      after: '」を更新',
    })
  })

  it('place: add/update', () => {
    const add: FeedItem = {
      ...item('place', 'pl1', '2030-01-01T00:00:00Z'),
      title: 'モデルハウスA',
    }
    const update: FeedItem = {
      ...item('place', 'pl1', '2030-01-01T00:00:00Z', 'update'),
      title: 'モデルハウスA',
    }
    expect(feedSentence(add)).toEqual({
      before: '場所「',
      link: 'モデルハウスA',
      after: '」を追加',
    })
    expect(feedSentence(update)).toEqual({
      before: '場所「',
      link: 'モデルハウスA',
      after: '」を更新',
    })
  })

  it('video: add/update', () => {
    const add: FeedItem = { ...item('video', 'vi1', '2030-01-01T00:00:00Z'), title: 'テスト動画' }
    const update: FeedItem = {
      ...item('video', 'vi1', '2030-01-01T00:00:00Z', 'update'),
      title: 'テスト動画',
    }
    expect(feedSentence(add)).toEqual({ before: '動画「', link: 'テスト動画', after: '」を追加' })
    expect(feedSentence(update)).toEqual({
      before: '動画「',
      link: 'テスト動画',
      after: '」を更新',
    })
  })

  it('source: add/update', () => {
    const add: FeedItem = { ...item('source', 's1', '2030-01-01T00:00:00Z'), title: 'テストch' }
    const update: FeedItem = {
      ...item('source', 's1', '2030-01-01T00:00:00Z', 'update'),
      title: 'テストch',
    }
    expect(feedSentence(add)).toEqual({ before: '情報源「', link: 'テストch', after: '」を追加' })
    expect(feedSentence(update)).toEqual({
      before: '情報源「',
      link: 'テストch',
      after: '」を更新',
    })
  })

  it('comment: puts the target name in the link and the body after the colon (wording is fixed regardless of action)', () => {
    const i: FeedItem = {
      ...item('comment', 'c1', '2030-01-01T00:00:00Z'),
      subtitle: '乙建設',
      title: '感想です',
    }
    expect(feedSentence(i)).toEqual({
      before: '「',
      link: '乙建設',
      after: '」にコメント：感想です',
    })
  })

  it('comment: uses "（削除済み）" (deleted) as the link when there is no subtitle', () => {
    const i: FeedItem = {
      ...item('comment', 'c1', '2030-01-01T00:00:00Z'),
      subtitle: undefined,
      title: '消えた対象への一言',
    }
    expect(feedSentence(i).link).toBe('（削除済み）')
  })

  it('comment: cuts the body at 40 characters and appends … when it exceeds 40 characters', () => {
    const body = 'あ'.repeat(45)
    const i: FeedItem = {
      ...item('comment', 'c1', '2030-01-01T00:00:00Z'),
      subtitle: '乙建設',
      title: body,
    }
    expect(feedSentence(i).after).toBe(`」にコメント：${'あ'.repeat(40)}…`)
  })

  it('comment: does not append … when the body is exactly 40 characters', () => {
    const body = 'あ'.repeat(40)
    const i: FeedItem = {
      ...item('comment', 'c1', '2030-01-01T00:00:00Z'),
      subtitle: '乙建設',
      title: body,
    }
    expect(feedSentence(i).after).toBe(`」にコメント：${body}`)
  })

  it('photo: puts the visit record name in the link, with wording fixed to add', () => {
    const i: FeedItem = {
      ...item('photo', 'ph1', '2030-01-01T00:00:00Z'),
      subtitle: 'ギャラリーC',
      title: '外観',
    }
    expect(feedSentence(i)).toEqual({ before: '「', link: 'ギャラリーC', after: '」に写真を追加' })
  })

  it('photo: uses "見学記録" (visit record) as the link when there is no subtitle', () => {
    const i: FeedItem = {
      ...item('photo', 'ph1', '2030-01-01T00:00:00Z'),
      subtitle: undefined,
      title: '外観',
    }
    expect(feedSentence(i).link).toBe('見学記録')
  })
})
