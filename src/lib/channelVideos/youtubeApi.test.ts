import { describe, expect, it } from 'vitest'

import {
  kindPlaylistId,
  parseIsoDuration,
  parsePlaylistItems,
  parseVideoDetails,
  playlistItemsUrl,
  videoDetailsUrl,
} from './youtubeApi'

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa'

describe('kindPlaylistId', () => {
  it('swaps UC for the prefix of each kind', () => {
    expect(kindPlaylistId(CH, 'video')).toBe('UULFaaaaaaaaaaaaaaaaaaaaaa')
    expect(kindPlaylistId(CH, 'live')).toBe('UULVaaaaaaaaaaaaaaaaaaaaaa')
    expect(kindPlaylistId(CH, 'short')).toBe('UUSHaaaaaaaaaaaaaaaaaaaaaa')
  })
})

describe('request URLs', () => {
  it('asks for 50 playlist items and only the fields used', () => {
    const url = new URL(playlistItemsUrl('UULFaaaaaaaaaaaaaaaaaaaaaa', 'k'))
    expect(url.pathname).toBe('/youtube/v3/playlistItems')
    expect(url.searchParams.get('maxResults')).toBe('50')
    expect(url.searchParams.get('playlistId')).toBe('UULFaaaaaaaaaaaaaaaaaaaaaa')
    expect(url.searchParams.get('key')).toBe('k')
  })

  it('asks for length and views of the ids', () => {
    const url = new URL(videoDetailsUrl(['aaaaaaaaaaa', 'bbbbbbbbbbb'], 'k'))
    expect(url.pathname).toBe('/youtube/v3/videos')
    expect(url.searchParams.get('id')).toBe('aaaaaaaaaaa,bbbbbbbbbbb')
    expect(url.searchParams.get('part')).toBe('contentDetails,statistics')
  })
})

describe('parsePlaylistItems', () => {
  it('reads id, title and date, skipping hidden and malformed items', () => {
    const item = (videoId: unknown, title: unknown, videoPublishedAt?: unknown) => ({
      snippet: { title },
      contentDetails: { videoId, videoPublishedAt },
    })
    expect(
      parsePlaylistItems({
        items: [
          item('aaaaaaaaaaa', ' ルームツアー ', '2026-10-01T09:00:00Z'),
          item('bbbbbbbbbbb', '公開前', undefined),
          item('ccccccccccc', 'Private video'),
          item('ddddddddddd', ''),
          item('eeeeeeeeeee', 42),
          item('bad', 'x'),
          { snippet: { title: 'x' } },
          null,
        ],
      }),
    ).toEqual([
      { videoId: 'aaaaaaaaaaa', title: 'ルームツアー', publishedAt: '2026-10-01T09:00:00.000Z' },
      { videoId: 'bbbbbbbbbbb', title: '公開前', publishedAt: null },
    ])
  })

  it('returns nothing for a response without items', () => {
    expect(parsePlaylistItems(null)).toEqual([])
    expect(parsePlaylistItems({ error: {} })).toEqual([])
  })
})

describe('parseIsoDuration', () => {
  it.each([
    ['PT1M35S', 95],
    ['PT1H', 3600],
    ['PT45S', 45],
    ['P1DT2S', 86402],
    ['P0D', 0],
  ])('%s -> %i', (raw, sec) => {
    expect(parseIsoDuration(raw)).toBe(sec)
  })

  it.each(['', 'P', 'PT', '1M', 'PT1.5S', 5])('rejects %j', (raw) => {
    expect(parseIsoDuration(raw)).toBeNull()
  })
})

describe('parseVideoDetails', () => {
  it('reads length and views, leaving out what is missing', () => {
    expect(
      parseVideoDetails({
        items: [
          {
            id: 'aaaaaaaaaaa',
            contentDetails: { duration: 'PT1M35S' },
            statistics: { viewCount: '12345' },
          },
          { id: 'bbbbbbbbbbb', contentDetails: { duration: 'P0D' }, statistics: {} },
          { id: 'ccccccccccc' },
          { contentDetails: {} },
          null,
        ],
      }),
    ).toEqual({
      aaaaaaaaaaa: { durationSec: 95, viewCount: 12345 },
      bbbbbbbbbbb: { durationSec: null, viewCount: null },
      ccccccccccc: { durationSec: null, viewCount: null },
    })
    expect(parseVideoDetails(undefined)).toEqual({})
  })
})
