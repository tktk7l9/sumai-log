import { describe, expect, it } from 'vitest'

import {
  CHANNEL_TABS,
  channelVideoUpsertSql,
  channelVideosOf,
  parseChannelsConfig,
  parseFlatPlaylist,
  publishedAtFromWatchPage,
  recordedWatchedBackfillSql,
  type ChannelConfig,
} from './import'

const CHANNEL_ID = 'UC0123456789abcdefghij_-'
const OTHER_ID = 'UCzzzzzzzzzzzzzzzzzzzzzz'

describe('parseChannelsConfig', () => {
  it('reads channels and defaults vendorId to null', () => {
    expect(
      parseChannelsConfig({
        channels: [
          { channelId: CHANNEL_ID, name: ' 甲工務店 ', vendorId: 'v1' },
          { channelId: OTHER_ID, name: '乙の会' },
        ],
      }),
    ).toEqual([
      { channelId: CHANNEL_ID, name: '甲工務店', vendorId: 'v1' },
      { channelId: OTHER_ID, name: '乙の会', vendorId: null },
    ])
  })

  it.each([
    [null, 'expected'],
    [{ channels: [] }, 'expected'],
    [{ channels: ['x'] }, 'not an object'],
    [{ channels: [{ channelId: 'abc', name: '甲' }] }, 'channelId'],
    [
      {
        channels: [
          { channelId: CHANNEL_ID, name: '甲' },
          { channelId: CHANNEL_ID, name: '乙' },
        ],
      },
      'channelId',
    ],
    [{ channels: [{ channelId: CHANNEL_ID, name: ' ' }] }, 'name'],
    [{ channels: [{ channelId: CHANNEL_ID, name: '甲', vendorId: 3 }] }, 'vendorId'],
  ])('rejects %j', (json, message) => {
    expect(() => parseChannelsConfig(json)).toThrow(message)
  })
})

describe('parseFlatPlaylist', () => {
  it('returns nothing for a tab the channel does not have', () => {
    expect(parseFlatPlaylist(null)).toEqual([])
    expect(parseFlatPlaylist({ entries: null })).toEqual([])
  })

  it('keeps entries with an id and a title, and only sane numbers', () => {
    expect(
      parseFlatPlaylist({
        entries: [
          { id: 'aaaaaaaaaaa', title: ' 一本目 ', duration: 75.4, view_count: 1200 },
          { id: 'bbbbbbbbbbb', title: '二本目', duration: null, view_count: -1 },
          { id: 'ccccccccccc', title: '三本目', duration: Number.NaN, view_count: '9' },
          { id: 'short', title: '短い id' },
          { id: 'ddddddddddd', title: '' },
          { id: 'eeeeeeeeeee' },
          'not an entry',
        ],
      }),
    ).toEqual([
      { videoId: 'aaaaaaaaaaa', title: '一本目', durationSec: 75, viewCount: 1200 },
      { videoId: 'bbbbbbbbbbb', title: '二本目', durationSec: null, viewCount: null },
      { videoId: 'ccccccccccc', title: '三本目', durationSec: null, viewCount: null },
    ])
  })
})

describe('channelVideosOf', () => {
  const channel: ChannelConfig = { channelId: CHANNEL_ID, name: '甲工務店', vendorId: 'v1' }
  const entry = (videoId: string) => ({ videoId, title: videoId, durationSec: 1, viewCount: 1 })

  it('numbers the videos across the tabs and keeps a repeated video once', () => {
    const rows = channelVideosOf(channel, [
      { kind: 'video', entries: [entry('aaaaaaaaaaa'), entry('bbbbbbbbbbb')] },
      { kind: 'live', entries: [entry('bbbbbbbbbbb'), entry('ccccccccccc')] },
      { kind: 'short', entries: [] },
    ])
    expect(rows.map((r) => [r.videoId, r.kind, r.sortOrder])).toEqual([
      ['aaaaaaaaaaa', 'video', 0],
      ['bbbbbbbbbbb', 'video', 1],
      ['ccccccccccc', 'live', 2],
    ])
    expect(rows[0]).toMatchObject({
      channelId: CHANNEL_ID,
      channel: '甲工務店',
      vendorId: 'v1',
      publishedAt: null,
    })
  })

  it('reads the tabs in the order videos, live, shorts', () => {
    expect(CHANNEL_TABS.map((t) => t.kind)).toEqual(['video', 'live', 'short'])
  })
})

describe('channelVideoUpsertSql', () => {
  it('upserts by video_id, keeps the watched flag and takes it from a work or a record when new', () => {
    const sql = channelVideoUpsertSql(
      {
        videoId: 'aaaaaaaaaaa',
        title: "甲'の家",
        durationSec: null,
        viewCount: 10,
        channelId: CHANNEL_ID,
        channel: '甲工務店',
        vendorId: null,
        kind: 'short',
        sortOrder: 4,
        publishedAt: '2026-09-22T09:00:07.000Z',
      },
      'id-1',
    )
    expect(sql).toContain(
      `VALUES ('id-1', 'aaaaaaaaaaa', '${CHANNEL_ID}', '甲工務店', NULL, 'short', '甲''の家', NULL, 10, 4, '2026-09-22T09:00:07.000Z', COALESCE((SELECT watched_at FROM works WHERE youtube_video_id = 'aaaaaaaaaaa'`,
    )
    expect(sql).toContain("FROM videos WHERE video_id = 'aaaaaaaaaaa'")
    expect(sql).toContain(
      'published_at = COALESCE(excluded.published_at, channel_videos.published_at)',
    )
    expect(sql).toContain('ON CONFLICT(video_id) DO UPDATE SET channel_id = excluded.channel_id')
    expect(sql).not.toMatch(/watched_at = excluded/)
    expect(sql.endsWith(';')).toBe(true)
  })
})

describe('publishedAtFromWatchPage', () => {
  it('reads the date with its offset and returns it in UTC', () => {
    expect(
      publishedAtFromWatchPage(
        '<meta itemprop="datePublished" content="2026-09-22T02:00:07-07:00">',
      ),
    ).toBe('2026-09-22T09:00:07.000Z')
    expect(publishedAtFromWatchPage('{"publishDate":"2025-01-31T23:30:00-08:00"}')).toBe(
      '2025-02-01T07:30:00.000Z',
    )
  })

  it('returns null when the page has no date or an unreadable one', () => {
    expect(publishedAtFromWatchPage('<html></html>')).toBeNull()
    expect(publishedAtFromWatchPage('{"publishDate":"someday"}')).toBeNull()
  })
})

describe('recordedWatchedBackfillSql', () => {
  it('marks unwatched channel videos and works that are in the video records', () => {
    const [channel, work] = recordedWatchedBackfillSql()
    expect(channel).toMatch(/^UPDATE channel_videos SET watched_at = /)
    expect(channel).toContain(
      'WHERE watched_at IS NULL AND video_id IN (SELECT video_id FROM videos)',
    )
    expect(work).toContain('videos.video_id = works.youtube_video_id')
    expect(work).toContain('youtube_video_id IN (SELECT video_id FROM videos)')
  })
})
