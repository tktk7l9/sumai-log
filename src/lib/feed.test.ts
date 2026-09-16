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
  it('at の新しい順に並べる', () => {
    const groups = [
      [item('visit', 'a', '2030-01-01T00:00:00Z')],
      [item('event', 'b', '2030-01-03T00:00:00Z')],
      [item('comment', 'c', '2030-01-02T00:00:00Z')],
    ]
    expect(mergeFeed(groups, 10).map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('同時刻は kind の順（見学記録→予定→業者→物件→場所→動画→情報源→コメント→写真）で安定する', () => {
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

  it('limit が 0 以下なら空（負数を slice にそのまま渡さない）', () => {
    const groups = [
      [item('visit', 'a', '2030-01-01T00:00:00Z'), item('visit', 'b', '2030-01-02T00:00:00Z')],
    ]
    expect(mergeFeed(groups, 0)).toEqual([])
    expect(mergeFeed(groups, -1)).toEqual([])
  })

  it('at が読めない要素は最も古い扱いにする（feed から落とさない）', () => {
    const groups = [
      [item('visit', 'bad', 'invalid'), item('visit', 'good', '2030-01-01T00:00:00Z')],
    ]
    expect(mergeFeed(groups, 10).map((i) => i.id)).toEqual(['good', 'bad'])
  })

  it('href.search を持つ項目もそのまま素通しする（予定の /calendar 遷移用）', () => {
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
      source: '情報源',
    })
  })
})

describe('FEED_ACTION_LABEL', () => {
  it('add/update に日本語ラベルがある', () => {
    expect(FEED_ACTION_LABEL).toEqual({ add: '追加', update: '更新' })
  })
})

describe('groupFeedByDay', () => {
  it('at（JST の日付キー）でまとめ、最初に出てきた順（新しい日が先）で日を並べる', () => {
    const items = [
      item('event', 'b', '2030-01-02T20:00:00Z'), // JST 2030-01-03
      item('visit', 'a', '2030-01-02T00:00:00Z'), // JST 2030-01-02
      item('vendor', 'c', '2030-01-01T23:00:00Z'), // JST 2030-01-02（同じ日にまとまる）
    ]
    const groups = groupFeedByDay(items)
    expect(groups.map((g) => g.day)).toEqual(['2030-01-03', '2030-01-02'])
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['b'])
    expect(groups[1]?.items.map((i) => i.id)).toEqual(['a', 'c'])
  })

  it('同じ日が連続していれば 1 グループにまとまる', () => {
    const items = [
      item('visit', 'a', '2030-01-02T00:00:00Z'),
      item('event', 'b', '2030-01-02T10:00:00Z'),
    ]
    const groups = groupFeedByDay(items)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toEqual({ day: '2030-01-02', items: [items[0], items[1]] })
  })

  it('空なら空', () => {
    expect(groupFeedByDay([])).toEqual([])
  })
})

describe('feedSentence', () => {
  it('visit: 追加', () => {
    const i: FeedItem = { ...item('visit', 'v1', '2030-01-01T00:00:00Z'), title: 'ギャラリーA' }
    expect(feedSentence(i)).toEqual({
      before: '見学記録「',
      link: 'ギャラリーA',
      after: '」を追加',
    })
  })

  it('visit: 更新', () => {
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

  it('event: 追加/更新', () => {
    const add: FeedItem = { ...item('event', 'e1', '2030-01-01T00:00:00Z'), title: '内覧会' }
    const update: FeedItem = {
      ...item('event', 'e1', '2030-01-01T00:00:00Z', 'update'),
      title: '内覧会',
    }
    expect(feedSentence(add)).toEqual({ before: '予定「', link: '内覧会', after: '」を追加' })
    expect(feedSentence(update)).toEqual({ before: '予定「', link: '内覧会', after: '」を更新' })
  })

  it('vendor: 追加/更新', () => {
    const add: FeedItem = { ...item('vendor', 've1', '2030-01-01T00:00:00Z'), title: '甲建設' }
    const update: FeedItem = {
      ...item('vendor', 've1', '2030-01-01T00:00:00Z', 'update'),
      title: '甲建設',
    }
    expect(feedSentence(add)).toEqual({ before: '業者「', link: '甲建設', after: '」を追加' })
    expect(feedSentence(update)).toEqual({ before: '業者「', link: '甲建設', after: '」を更新' })
  })

  it('property: 追加/更新', () => {
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

  it('place: 追加/更新', () => {
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

  it('video: 追加/更新', () => {
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

  it('source: 追加/更新', () => {
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

  it('comment: 対象名をリンクに、本文をコロン以降に載せる（action に関わらず文言は固定）', () => {
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

  it('comment: subtitle が無ければ「（削除済み）」をリンクに使う', () => {
    const i: FeedItem = {
      ...item('comment', 'c1', '2030-01-01T00:00:00Z'),
      subtitle: undefined,
      title: '消えた対象への一言',
    }
    expect(feedSentence(i).link).toBe('（削除済み）')
  })

  it('comment: 本文が 40 字を超えたら 40 字で切って … を付ける', () => {
    const body = 'あ'.repeat(45)
    const i: FeedItem = {
      ...item('comment', 'c1', '2030-01-01T00:00:00Z'),
      subtitle: '乙建設',
      title: body,
    }
    expect(feedSentence(i).after).toBe(`」にコメント：${'あ'.repeat(40)}…`)
  })

  it('comment: 本文がちょうど 40 字なら … は付かない', () => {
    const body = 'あ'.repeat(40)
    const i: FeedItem = {
      ...item('comment', 'c1', '2030-01-01T00:00:00Z'),
      subtitle: '乙建設',
      title: body,
    }
    expect(feedSentence(i).after).toBe(`」にコメント：${body}`)
  })

  it('photo: 見学記録名をリンクに、追加固定の文言になる', () => {
    const i: FeedItem = {
      ...item('photo', 'ph1', '2030-01-01T00:00:00Z'),
      subtitle: 'ギャラリーC',
      title: '外観',
    }
    expect(feedSentence(i)).toEqual({ before: '「', link: 'ギャラリーC', after: '」に写真を追加' })
  })

  it('photo: subtitle が無ければ「見学記録」をリンクに使う', () => {
    const i: FeedItem = {
      ...item('photo', 'ph1', '2030-01-01T00:00:00Z'),
      subtitle: undefined,
      title: '外観',
    }
    expect(feedSentence(i).link).toBe('見学記録')
  })
})
