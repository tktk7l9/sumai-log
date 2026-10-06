import { describe, expect, it } from 'vitest'

import { filterVideos, normalizeSearch, tagOptions, vendorOptions } from './videoFilter'

const videos = [
  {
    id: 'a',
    title: '平屋のルームツアー【甲工務店】',
    channel: '甲工務店',
    tags: ['間取り', '平屋'],
    vendorId: 'v1',
    vendorName: '甲工務店',
  },
  {
    id: 'b',
    title: 'ＵＡ値の話',
    channel: '構造の人',
    tags: ['断熱'],
    vendorId: null,
    vendorName: null,
  },
  {
    id: 'c',
    title: '二階建て 完成見学会',
    channel: '乙の会',
    tags: ['間取り'],
    vendorId: 'v2',
    vendorName: '乙の会',
  },
  { id: 'd', title: 'タグなし', channel: null, tags: [], vendorId: 'v1', vendorName: '甲工務店' },
]

describe('normalizeSearch', () => {
  it('folds width, case, spaces and katakana', () => {
    expect(normalizeSearch('ＵＡ 値 ルーム')).toBe('ua値るーむ')
  })
})

describe('filterVideos', () => {
  it('returns everything without a filter', () => {
    expect(filterVideos(videos, {})).toHaveLength(4)
  })

  it('filters by tag, by vendor and by both', () => {
    expect(filterVideos(videos, { tag: '間取り' }).map((v) => v.id)).toEqual(['a', 'c'])
    expect(filterVideos(videos, { vendorId: 'v1' }).map((v) => v.id)).toEqual(['a', 'd'])
    expect(filterVideos(videos, { tag: '間取り', vendorId: 'v1' }).map((v) => v.id)).toEqual(['a'])
  })

  it('searches the title and the channel, loosely', () => {
    expect(filterVideos(videos, { q: 'るーむ' }).map((v) => v.id)).toEqual(['a'])
    expect(filterVideos(videos, { q: 'ua' }).map((v) => v.id)).toEqual(['b'])
    expect(filterVideos(videos, { q: '乙' }).map((v) => v.id)).toEqual(['c'])
    expect(filterVideos(videos, { q: '  ' })).toHaveLength(4)
  })
})

describe('tagOptions', () => {
  it('counts the tags in use, most used first, then as first seen', () => {
    expect(tagOptions(videos)).toEqual([
      { name: '間取り', count: 2 },
      { name: '平屋', count: 1 },
      { name: '断熱', count: 1 },
    ])
  })
})

describe('vendorOptions', () => {
  it('counts the vendors with memos, most memos first, then as first seen', () => {
    expect(vendorOptions(videos)).toEqual([
      { id: 'v1', name: '甲工務店', count: 2 },
      { id: 'v2', name: '乙の会', count: 1 },
    ])
  })

  it('skips a vendor whose name is gone', () => {
    expect(vendorOptions([{ vendorId: 'v9', vendorName: null }])).toEqual([])
  })
})
