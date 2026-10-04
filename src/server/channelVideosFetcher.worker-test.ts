import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { channelVideos, vendors, videos, works } from '../db/schema'
import { refreshChannelVideos } from './channelVideosFetcher'
import { actor, db, reset } from './repository/test-helpers'

beforeEach(reset)

const VENDOR_ID = '00000000-0000-4000-8000-000000000001'
const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa'
const TAIL = CH.slice(2)

type Item = { id: string; title: string; at: string | null; sec?: number; views?: number }

/** Replacement for fetch: answers playlistItems and videos from the given playlists. Never hits YouTube */
function fakeYoutube(playlists: Record<string, Item[] | number>) {
  const calls: string[] = []
  const all = Object.values(playlists).flatMap((p) => (typeof p === 'number' ? [] : p))
  const fetchImpl = (async (input: string | URL) => {
    const url = new URL(String(input))
    calls.push(url.pathname.split('/').pop() ?? '')
    if (url.pathname.endsWith('/playlistItems')) {
      const playlist = playlists[url.searchParams.get('playlistId') ?? '']
      if (playlist === undefined) return new Response('{}', { status: 404 })
      if (typeof playlist === 'number') return new Response('{}', { status: playlist })
      return Response.json({
        items: playlist.map((v) => ({
          snippet: { title: v.title },
          contentDetails: { videoId: v.id, videoPublishedAt: v.at ?? undefined },
        })),
      })
    }
    const ids = url.searchParams.get('id')?.split(',') ?? []
    return Response.json({
      items: all
        .filter((v) => ids.includes(v.id))
        .map((v) => ({
          id: v.id,
          contentDetails: { duration: v.sec === undefined ? undefined : `PT${v.sec}S` },
          statistics: { viewCount: v.views === undefined ? undefined : String(v.views) },
        })),
    })
  }) as typeof fetch
  return { fetchImpl, calls }
}

async function seedChannel() {
  await db.insert(vendors).values({ id: VENDOR_ID, name: '甲工務店', createdBy: actor })
  await db.insert(channelVideos).values({
    id: crypto.randomUUID(),
    videoId: 'oldaaaaaaaa',
    channelId: CH,
    channel: '甲工務店',
    vendorId: VENDOR_ID,
    kind: 'video',
    title: '古いタイトル',
    durationSec: 300,
    viewCount: 10,
    publishedAt: '2026-01-01T00:00:00.000Z',
    sortOrder: 0,
    watchedAt: '2026-02-01T00:00:00.000Z',
  })
}

const listed = () =>
  db
    .select()
    .from(channelVideos)
    .orderBy(asc(channelVideos.sortOrder))
    .then((rows) => rows.map((r) => [r.videoId, r.kind, r.title, r.durationSec, r.viewCount]))

describe('refreshChannelVideos', () => {
  it('adds new videos on top, newest first, and refreshes the ones it already has', async () => {
    await seedChannel()
    const { fetchImpl, calls } = fakeYoutube({
      [`UULF${TAIL}`]: [
        { id: 'new2aaaaaaa', title: '新しい2', at: '2026-10-03T00:00:00Z', sec: 754, views: 5 },
        { id: 'new1aaaaaaa', title: '新しい1', at: '2026-10-01T00:00:00Z', sec: 95, views: 3 },
        { id: 'oldaaaaaaaa', title: '新しいタイトル', at: '2026-01-01T00:00:00Z', views: 99 },
      ],
      [`UUSH${TAIL}`]: [
        { id: 'shortaaaaaa', title: 'ショート', at: '2026-10-02T00:00:00Z', sec: 30 },
      ],
    })

    const result = await refreshChannelVideos(db, 'k', fetchImpl)

    expect(result.channels).toEqual([{ channel: '甲工務店', added: 3, updated: 1, error: null }])
    expect(await listed()).toEqual([
      ['new2aaaaaaa', 'video', '新しい2', 754, 5],
      ['shortaaaaaa', 'short', 'ショート', 30, null],
      ['new1aaaaaaa', 'video', '新しい1', 95, 3],
      // Length kept when the API gave none; the watched flag is untouched
      ['oldaaaaaaaa', 'video', '新しいタイトル', 300, 99],
    ])
    const [old] = await db
      .select()
      .from(channelVideos)
      .where(eq(channelVideos.videoId, 'oldaaaaaaaa'))
    expect(old?.watchedAt).toBe('2026-02-01T00:00:00.000Z')
    // 3 playlists (live has none: 404) and one videos.list for the 4 ids
    expect(calls).toEqual(['playlistItems', 'playlistItems', 'playlistItems', 'videos'])

    const again = await refreshChannelVideos(db, 'k', fetchImpl)
    expect(again.channels[0]).toMatchObject({ added: 0, updated: 4 })
  })

  it('starts a new video as watched when it is in the records, and links a work by name', async () => {
    await seedChannel()
    await db.insert(videos).values({
      id: crypto.randomUUID(),
      url: 'https://www.youtube.com/watch?v=tourAaaaaaa',
      videoId: 'tourAaaaaaa',
      title: '記録した動画',
      watchedOn: '2026-10-04',
      createdBy: actor,
    })
    await db.insert(works).values({
      id: crypto.randomUUID(),
      sourceUrl: 'https://example.com/works/p1/',
      site: 'siteA',
      vendorId: VENDOR_ID,
      title: '「架空の家」',
    })
    const { fetchImpl } = fakeYoutube({
      [`UULF${TAIL}`]: [
        { id: 'tourAaaaaaa', title: '【ルームツアー】架空の家', at: '2026-10-04T00:00:00Z' },
      ],
    })

    const result = await refreshChannelVideos(db, 'k', fetchImpl)

    expect(result.linked).toBe(1)
    const [video] = await db
      .select()
      .from(channelVideos)
      .where(eq(channelVideos.videoId, 'tourAaaaaaa'))
    expect(video?.watchedAt).toBe('2026-10-04T00:00:00+09:00')
    expect(video?.watchedBy).toBe(actor)
    const [work] = await db.select().from(works)
    expect([work?.youtubeVideoId, work?.videoSource, work?.watchedAt]).toEqual([
      'tourAaaaaaa',
      'title',
      '2026-10-04T00:00:00+09:00',
    ])
  })

  it('reports a channel the API refused and keeps its videos', async () => {
    await seedChannel()
    const { fetchImpl } = fakeYoutube({ [`UULF${TAIL}`]: 403 })

    const result = await refreshChannelVideos(db, 'k', fetchImpl)

    expect(result.channels).toEqual([
      { channel: '甲工務店', added: 0, updated: 0, error: 'YouTube API 403' },
    ])
    expect(await listed()).toHaveLength(1)
  })

  it('does nothing without channels', async () => {
    const { fetchImpl, calls } = fakeYoutube({})
    expect(await refreshChannelVideos(db, 'k', fetchImpl)).toEqual({ channels: [], linked: 0 })
    expect(calls).toEqual([])
  })
})
