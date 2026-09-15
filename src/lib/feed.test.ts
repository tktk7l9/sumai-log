import { describe, expect, it } from 'vitest'

import { FEED_KIND_LABEL, mergeFeed, type FeedItem } from './feed'

const item = (kind: FeedItem['kind'], id: string, at: string): FeedItem => ({
  kind,
  id,
  title: id,
  at,
  by: 'owner@example.com',
  href: { to: `/records/${id}` },
})

describe('mergeFeed', () => {
  it('at の新しい順に並べる', () => {
    const groups = [
      [item('visit', 'a', '2030-01-01T00:00:00Z')],
      [item('event', 'b', '2030-01-03T00:00:00Z')],
      [item('comment', 'c', '2030-01-02T00:00:00Z')],
    ]
    expect(mergeFeed(groups, 10).map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('同時刻は kind の順（見学記録→予定→業者→物件→場所→動画→コメント→写真）で安定する', () => {
    const at = '2030-01-01T00:00:00Z'
    const groups = [
      [item('photo', 'photo', at), item('video', 'video', at), item('visit', 'visit', at)],
      [item('comment', 'comment', at), item('event', 'event', at)],
    ]
    expect(mergeFeed(groups, 10).map((i) => i.kind)).toEqual([
      'visit',
      'event',
      'video',
      'comment',
      'photo',
    ])
  })

  it('limit 件に絞る', () => {
    const groups = [
      [
        item('visit', 'a', '2030-01-01T00:00:00Z'),
        item('visit', 'b', '2030-01-02T00:00:00Z'),
        item('visit', 'c', '2030-01-03T00:00:00Z'),
      ],
    ]
    expect(mergeFeed(groups, 2).map((i) => i.id)).toEqual(['c', 'b'])
  })

  it('空なら空', () => {
    expect(mergeFeed([], 10)).toEqual([])
    expect(mergeFeed([[]], 10)).toEqual([])
  })

  it('at が読めない要素は最も古い扱いにする（feed から落とさない）', () => {
    const groups = [
      [item('visit', 'bad', 'invalid'), item('visit', 'good', '2030-01-01T00:00:00Z')],
    ]
    expect(mergeFeed(groups, 10).map((i) => i.id)).toEqual(['good', 'bad'])
  })

  it('入力の配列・要素を書き換えない', () => {
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
  it('全 kind に日本語ラベルがある', () => {
    expect(FEED_KIND_LABEL).toEqual({
      visit: '見学記録',
      event: '予定',
      vendor: '業者',
      property: '物件',
      place: '場所',
      video: '動画',
      comment: 'コメント',
      photo: '写真',
    })
  })
})
