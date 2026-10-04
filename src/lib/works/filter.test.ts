import { describe, expect, it } from 'vitest'

import { filterWorks, formatTsubo, specOf, vendorOptions, watchedSummary } from './filter'

const base = {
  vendorId: null as string | null,
  vendorName: null as string | null,
  youtubeVideoId: null as string | null,
  watchedAt: null as string | null,
  points: [] as string[],
  family: null as string | null,
  siteAreaTsubo: null as number | null,
  floorAreaTsubo: null as number | null,
  totalAreaTsubo: null as number | null,
  layout: null as string | null,
}
const works = [
  { ...base, id: 'a', vendorId: 'v1', vendorName: '甲工務店', youtubeVideoId: 'abcdefghijk' },
  {
    ...base,
    id: 'b',
    vendorId: 'v1',
    vendorName: '甲工務店',
    youtubeVideoId: 'abcdefghijk',
    watchedAt: '2026-10-01T00:00:00.000Z',
  },
  { ...base, id: 'c', vendorId: 'v2', vendorName: '乙建設' },
  { ...base, id: 'd' },
]

describe('filterWorks', () => {
  it('returns everything without a filter', () => {
    expect(filterWorks(works, {})).toHaveLength(4)
  })

  it('filters by vendor, by having a video, and by not being watched', () => {
    expect(filterWorks(works, { vendorId: 'v1' }).map((w) => w.id)).toEqual(['a', 'b'])
    expect(filterWorks(works, { hasVideo: true }).map((w) => w.id)).toEqual(['a', 'b'])
    expect(filterWorks(works, { unwatched: true }).map((w) => w.id)).toEqual(['a', 'c', 'd'])
    expect(
      filterWorks(works, { vendorId: 'v1', hasVideo: true, unwatched: true }).map((w) => w.id),
    ).toEqual(['a'])
  })
})

describe('watchedSummary', () => {
  it('counts the total, those with a video and those watched', () => {
    expect(watchedSummary(works)).toEqual({ total: 4, withVideo: 2, watched: 1 })
  })
})

describe('vendorOptions', () => {
  it('lists each vendor once in first-seen order with its count, leaving out works without a vendor', () => {
    expect(vendorOptions(works)).toEqual([
      { id: 'v1', name: '甲工務店', count: 2 },
      { id: 'v2', name: '乙建設', count: 1 },
    ])
  })

  it('leaves out a vendor id whose name is missing', () => {
    expect(vendorOptions([{ vendorId: 'v9', vendorName: null }])).toEqual([])
  })
})

describe('formatTsubo', () => {
  it('drops trailing zeros and keeps at most 2 decimals', () => {
    expect(formatTsubo(50.5)).toBe('50.5坪')
    expect(formatTsubo(33.15)).toBe('33.15坪')
    expect(formatTsubo(30)).toBe('30坪')
  })
})

describe('specOf', () => {
  it('orders the areas as site, floor, total and leaves out the missing ones', () => {
    const spec = specOf({
      ...base,
      points: ['UA値0.31'],
      family: '大人2人',
      siteAreaTsubo: 50.5,
      totalAreaTsubo: 33.15,
      layout: '3LDK',
    })
    expect(spec).toEqual({
      points: ['UA値0.31'],
      family: '大人2人',
      areas: [
        { label: '敷地面積', value: '50.5坪' },
        { label: '総施工面積', value: '33.15坪' },
      ],
      layout: '3LDK',
      isEmpty: false,
    })
  })

  it('is empty when the site gave none of the four', () => {
    expect(specOf(base).isEmpty).toBe(true)
  })

  it.each([
    ['points', { points: ['耐震等級3'] }],
    ['family', { family: '大人2人' }],
    ['area', { floorAreaTsubo: 30 }],
    ['layout', { layout: '2LDK' }],
  ])('is not empty with only %s', (_name, over) => {
    expect(specOf({ ...base, ...over }).isEmpty).toBe(false)
  })
})
