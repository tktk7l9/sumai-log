import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  channelVideos,
  vendors,
  videos,
  visits,
  works,
  type NewChannelVideo,
} from '../../db/schema'
import {
  channelVideoUpsertSql,
  recordedWatchedBackfillSql,
  type ParsedChannelVideo,
} from '../../lib/channelVideos/import'
import {
  channelSummaries,
  channelVideoForMemo,
  listChannelVideos,
  setChannelVideoWatched,
} from './channelVideos'
import { actor, db, reset } from './test-helpers'
import { upsertPlace } from './places'
import { upsertVideo } from './videos'
import { listWorksWithVendor, setWorkWatched } from './works'

beforeEach(reset)

const VENDOR_ID = '00000000-0000-4000-8000-000000000001'
const CH_A = 'UCaaaaaaaaaaaaaaaaaaaaaa'
const CH_B = 'UCbbbbbbbbbbbbbbbbbbbbbb'

async function addVideo(over: Partial<NewChannelVideo> & { videoId: string }): Promise<string> {
  const id = over.id ?? crypto.randomUUID()
  await db.insert(channelVideos).values({
    channelId: CH_A,
    channel: '甲工務店',
    kind: 'video',
    title: over.videoId,
    ...over,
    id,
  })
  return id
}

describe('channel videos repository', () => {
  it('lists vendor channels first, newest first, with the number of matches', async () => {
    await db.insert(vendors).values({ id: VENDOR_ID, name: '甲工務店', createdBy: actor })
    await addVideo({ videoId: 'b1aaaaaaaaa', channelId: CH_B, channel: '乙の会', sortOrder: 0 })
    await addVideo({ videoId: 'a2aaaaaaaaa', vendorId: VENDOR_ID, sortOrder: 1 })
    await addVideo({ videoId: 'a1aaaaaaaaa', vendorId: VENDOR_ID, sortOrder: 0 })
    const all = await listChannelVideos(db, { limit: 10 })
    expect(all.rows.map((r) => r.videoId)).toEqual(['a1aaaaaaaaa', 'a2aaaaaaaaa', 'b1aaaaaaaaa'])
    expect(all.matched).toBe(3)
    expect(all.rows[0]).not.toHaveProperty('watchedBy')
    expect(all.rows[0]?.work).toBeNull()

    const firstTwo = await listChannelVideos(db, { limit: 2 })
    expect([firstTwo.rows.length, firstTwo.matched]).toEqual([2, 3])
  })

  it('filters by channel, kind, unwatched and a part of the title (case and % are plain)', async () => {
    await addVideo({ videoId: 'aaaaaaaaaaa', title: 'ルームツアー 平屋', kind: 'video' })
    await addVideo({ videoId: 'bbbbbbbbbbb', title: '100% Room Tour', kind: 'short' })
    await addVideo({
      videoId: 'ccccccccccc',
      title: 'ルームツアー 二階建て',
      channelId: CH_B,
      channel: '乙の会',
      watchedAt: '2026-10-01T00:00:00.000Z',
    })
    const ids = async (filter: Parameters<typeof listChannelVideos>[1]) =>
      (await listChannelVideos(db, filter)).rows.map((r) => r.videoId).sort()
    expect(await ids({ limit: 9, channelId: CH_B })).toEqual(['ccccccccccc'])
    expect(await ids({ limit: 9, kind: 'short' })).toEqual(['bbbbbbbbbbb'])
    expect(await ids({ limit: 9, unwatched: true })).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb'])
    expect(await ids({ limit: 9, q: 'ルームツアー' })).toEqual(['aaaaaaaaaaa', 'ccccccccccc'])
    expect(await ids({ limit: 9, q: 'room tour' })).toEqual(['bbbbbbbbbbb'])
    expect(await ids({ limit: 9, q: '0%' })).toEqual(['bbbbbbbbbbb'])
  })

  it('sums videos and watched videos per channel, in the order of the list', async () => {
    await addVideo({ videoId: 'aaaaaaaaaaa', watchedAt: '2026-10-01T00:00:00.000Z' })
    await addVideo({ videoId: 'bbbbbbbbbbb' })
    await addVideo({ videoId: 'ccccccccccc', channelId: CH_B, channel: '乙の会' })
    // Neither channel has a vendor, so the names decide: 乙 (U+4E59) before 甲 (U+7532)
    const zero = { total: 0, watched: 0 }
    expect(await channelSummaries(db)).toEqual([
      {
        channelId: CH_B,
        channel: '乙の会',
        total: 1,
        watched: 0,
        kinds: { video: { total: 1, watched: 0 }, short: zero, live: zero },
      },
      {
        channelId: CH_A,
        channel: '甲工務店',
        total: 2,
        watched: 1,
        kinds: { video: { total: 2, watched: 1 }, short: zero, live: zero },
      },
    ])
  })

  it('shares the watched flag with the work whose tour video is the same, both ways', async () => {
    const videoRowId = await addVideo({ videoId: 'aaaaaaaaaaa', durationSec: 754 })
    const workId = crypto.randomUUID()
    await db.insert(works).values({
      id: workId,
      sourceUrl: 'https://example.com/works/p1/',
      site: 'siteA',
      title: 'テストの家',
      uaValue: 0.5,
      layout: '3LDK',
      points: ['広い土間'],
      youtubeVideoId: 'aaaaaaaaaaa',
    })
    const work = async () => (await db.select().from(works).where(eq(works.id, workId)))[0]
    const video = async () =>
      (await db.select().from(channelVideos).where(eq(channelVideos.id, videoRowId)))[0]

    expect(await setChannelVideoWatched(db, videoRowId, true, actor)).toBe(true)
    expect((await work())?.watchedBy).toBe(actor)

    expect(await setWorkWatched(db, workId, false, actor)).toBe(true)
    expect((await video())?.watchedAt).toBeNull()

    expect(await setWorkWatched(db, workId, true, actor)).toBe(true)
    expect((await video())?.watchedBy).toBe(actor)

    const [listed] = await listWorksWithVendor(db)
    expect(listed?.videoDurationSec).toBe(754)
    const [video0] = (await listChannelVideos(db, { limit: 1 })).rows
    expect(video0?.work).toEqual({
      title: 'テストの家',
      sourceUrl: 'https://example.com/works/p1/',
      category: null,
      completedOn: null,
      uaValue: 0.5,
      cValue: null,
      family: null,
      siteAreaTsubo: null,
      floorAreaTsubo: null,
      totalAreaTsubo: null,
      layout: '3LDK',
      points: ['広い土間'],
    })
  })

  it('dates the videos of a house we visited, found by its name in the visited place', async () => {
    await db.insert(vendors).values({ id: VENDOR_ID, name: '甲工務店', createdBy: actor })
    await db.insert(works).values({
      id: crypto.randomUUID(),
      sourceUrl: 'https://example.com/works/p1/',
      site: 'siteA',
      vendorId: VENDOR_ID,
      title: '架空の家',
      youtubeVideoId: 'tourAaaaaaa',
    })
    const placeId = await upsertPlace(
      db,
      { name: '甲工務店「架空の家」完成見学会@横浜市', kind: 'other', vendorId: VENDOR_ID },
      actor,
    )
    await db.insert(visits).values({
      id: crypto.randomUUID(),
      placeId,
      vendorId: VENDOR_ID,
      visitedOn: '2026-03-28',
      createdBy: actor,
    })
    await addVideo({
      videoId: 'tourAaaaaaa',
      vendorId: VENDOR_ID,
      title: 'ルームツアー',
      sortOrder: 0,
    })
    await addVideo({
      videoId: 'talkAaaaaaa',
      vendorId: VENDOR_ID,
      title: '架空の家を解説',
      sortOrder: 1,
    })
    await addVideo({ videoId: 'otherAaaaaa', vendorId: VENDOR_ID, title: '別の家', sortOrder: 2 })

    const { rows } = await listChannelVideos(db, { limit: 9 })
    expect(rows.map((r) => [r.videoId, r.visit])).toEqual([
      ['tourAaaaaaa', { visitedOn: '2026-03-28' }],
      ['talkAaaaaaa', { visitedOn: '2026-03-28' }],
      ['otherAaaaaa', null],
    ])
  })

  it('returns false when the video does not exist', async () => {
    expect(await setChannelVideoWatched(db, crypto.randomUUID(), true, actor)).toBe(false)
  })
})

describe('channelVideoUpsertSql against D1', () => {
  const parsed: ParsedChannelVideo = {
    videoId: 'aaaaaaaaaaa',
    title: '一本目',
    durationSec: 60,
    viewCount: 5,
    channelId: CH_A,
    channel: '甲工務店',
    vendorId: null,
    kind: 'video',
    sortOrder: 0,
    publishedAt: '2026-09-22T09:00:07.000Z',
  }

  it('inserts, then updates the channel columns and keeps the watched flag', async () => {
    await env.DB.prepare(channelVideoUpsertSql(parsed, crypto.randomUUID())).run()
    const [first] = await db.select().from(channelVideos)
    expect(first?.watchedAt).toBeNull()
    await setChannelVideoWatched(db, first!.id, true, actor)

    await env.DB.prepare(
      channelVideoUpsertSql({ ...parsed, title: '改題', viewCount: 9 }, crypto.randomUUID()),
    ).run()
    const rows = await db.select().from(channelVideos)
    expect(rows).toHaveLength(1)
    expect([rows[0]?.id, rows[0]?.title, rows[0]?.viewCount]).toEqual([first!.id, '改題', 9])
    expect(rows[0]?.watchedBy).toBe(actor)
  })

  it('starts a new video as watched when the same tour video was watched on a work', async () => {
    await db.insert(works).values({
      id: crypto.randomUUID(),
      sourceUrl: 'https://example.com/works/p1/',
      site: 'siteA',
      title: 'テストの家',
      youtubeVideoId: 'aaaaaaaaaaa',
      watchedAt: '2026-10-01T00:00:00.000Z',
      watchedBy: actor,
    })
    await env.DB.prepare(channelVideoUpsertSql(parsed, crypto.randomUUID())).run()
    const [row] = await db.select().from(channelVideos)
    expect([row?.watchedAt, row?.watchedBy]).toEqual(['2026-10-01T00:00:00.000Z', actor])
  })
})

async function addRecord(videoId: string, watchedOn: string | null) {
  await db.insert(videos).values({
    id: crypto.randomUUID(),
    url: `https://www.youtube.com/watch?v=${videoId}`,
    videoId,
    title: '記録した動画',
    watchedOn,
    createdBy: actor,
  })
}

describe('published date and the video records', () => {
  const parsed: ParsedChannelVideo = {
    videoId: 'aaaaaaaaaaa',
    title: '一本目',
    durationSec: 60,
    viewCount: 5,
    channelId: CH_A,
    channel: '甲工務店',
    vendorId: null,
    kind: 'video',
    sortOrder: 0,
    publishedAt: '2026-09-22T09:00:07.000Z',
  }

  it('keeps a date read before when this run could not read it', async () => {
    await env.DB.prepare(channelVideoUpsertSql(parsed, crypto.randomUUID())).run()
    await env.DB.prepare(
      channelVideoUpsertSql({ ...parsed, publishedAt: null }, crypto.randomUUID()),
    ).run()
    const [row] = await db.select().from(channelVideos)
    expect(row?.publishedAt).toBe('2026-09-22T09:00:07.000Z')
    expect((await listChannelVideos(db, { limit: 1 })).rows[0]?.publishedAt).toBe(
      '2026-09-22T09:00:07.000Z',
    )
  })

  it('starts a new video as watched when it is already in the records', async () => {
    await addRecord('aaaaaaaaaaa', '2026-09-30')
    await env.DB.prepare(channelVideoUpsertSql(parsed, crypto.randomUUID())).run()
    const [row] = await db.select().from(channelVideos)
    expect([row?.watchedAt, row?.watchedBy]).toEqual(['2026-09-30T00:00:00+09:00', actor])
  })

  it('backfills videos and works imported before they were recorded, and only those', async () => {
    await addVideo({ videoId: 'aaaaaaaaaaa' })
    await addVideo({ videoId: 'bbbbbbbbbbb' })
    await addVideo({ videoId: 'ccccccccccc', watchedAt: '2026-01-01T00:00:00.000Z' })
    await db.insert(works).values({
      id: crypto.randomUUID(),
      sourceUrl: 'https://example.com/works/p1/',
      site: 'siteA',
      title: 'テストの家',
      youtubeVideoId: 'aaaaaaaaaaa',
    })
    await addRecord('aaaaaaaaaaa', null)
    await addRecord('ccccccccccc', '2026-09-30')
    for (const statement of recordedWatchedBackfillSql()) await env.DB.prepare(statement).run()

    const byId = Object.fromEntries(
      (await db.select().from(channelVideos)).map((r) => [r.videoId, r.watchedAt]),
    )
    expect(byId.aaaaaaaaaaa).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    expect(byId.bbbbbbbbbbb).toBeNull()
    // Already watched: left as it was
    expect(byId.ccccccccccc).toBe('2026-01-01T00:00:00.000Z')
    const [work] = await db.select().from(works)
    expect(work?.watchedBy).toBe(actor)
  })

  it('marks the channel video and the work when a video is recorded in the app', async () => {
    await addVideo({ videoId: 'aaaaaaaaaaa' })
    await db.insert(works).values({
      id: crypto.randomUUID(),
      sourceUrl: 'https://example.com/works/p1/',
      site: 'siteA',
      title: 'テストの家',
      youtubeVideoId: 'aaaaaaaaaaa',
    })
    const id = await upsertVideo(
      db,
      { url: 'https://youtu.be/aaaaaaaaaaa', videoId: 'aaaaaaaaaaa', title: '記録した動画' },
      actor,
    )
    const [video] = await db.select().from(channelVideos)
    const [work] = await db.select().from(works)
    expect([video?.watchedBy, work?.watchedBy]).toEqual([actor, actor])

    // Editing the record does not mark again a video whose mark was taken back on /works
    await setChannelVideoWatched(db, video!.id, false, actor)
    await upsertVideo(
      db,
      { id, url: 'https://youtu.be/aaaaaaaaaaa', videoId: 'aaaaaaaaaaa', title: '改題' },
      actor,
    )
    const [again] = await db.select().from(channelVideos)
    expect(again?.watchedAt).toBeNull()
  })

  it('lists the memo written for a video, and offers the channel video as the start of a memo', async () => {
    await db.insert(vendors).values({ id: VENDOR_ID, name: '甲工務店', createdBy: actor })
    await addVideo({ videoId: 'aaaaaaaaaaa', title: '平屋のルームツアー', vendorId: VENDOR_ID })
    await addVideo({ videoId: 'bbbbbbbbbbb' })
    expect((await listChannelVideos(db, { limit: 9 })).rows.map((r) => r.memoId)).toEqual([
      null,
      null,
    ])
    const memo = await upsertVideo(
      db,
      { url: 'https://youtu.be/aaaaaaaaaaa', videoId: 'aaaaaaaaaaa', title: 'メモ' },
      actor,
    )
    const rows = (await listChannelVideos(db, { limit: 9 })).rows
    expect(rows.find((r) => r.videoId === 'aaaaaaaaaaa')?.memoId).toBe(memo)
    expect(rows.find((r) => r.videoId === 'bbbbbbbbbbb')?.memoId).toBeNull()

    expect(await channelVideoForMemo(db, 'aaaaaaaaaaa')).toEqual({
      videoId: 'aaaaaaaaaaa',
      title: '平屋のルームツアー',
      channel: '甲工務店',
      vendorId: VENDOR_ID,
    })
    expect(await channelVideoForMemo(db, 'zzzzzzzzzzz')).toBeNull()
  })
})

describe('workVideoLinkSql against D1', () => {
  it('links a work without a video, leaves one with a video, and carries over the watched mark', async () => {
    const { workVideoLinkSql } = await import('../../lib/channelVideos/match')
    await addVideo({
      videoId: 'aaaaaaaaaaa',
      watchedAt: '2026-10-01T00:00:00.000Z',
      watchedBy: actor,
    })
    const insert = (sourceUrl: string, youtubeVideoId: string | null) =>
      db
        .insert(works)
        .values({ id: crypto.randomUUID(), sourceUrl, site: 'siteB', title: '家', youtubeVideoId })
    await insert('https://example.com/works/a', null)
    await insert('https://example.com/works/b', 'zzzzzzzzzzz')
    for (const statement of workVideoLinkSql([
      { sourceUrl: 'https://example.com/works/a', videoId: 'aaaaaaaaaaa' },
      { sourceUrl: 'https://example.com/works/b', videoId: 'aaaaaaaaaaa' },
    ])) {
      await env.DB.prepare(statement).run()
    }
    const rows = Object.fromEntries((await db.select().from(works)).map((w) => [w.sourceUrl, w]))
    expect(rows['https://example.com/works/a']).toMatchObject({
      youtubeVideoId: 'aaaaaaaaaaa',
      videoSource: 'title',
      watchedAt: '2026-10-01T00:00:00.000Z',
      watchedBy: actor,
    })
    expect(rows['https://example.com/works/b']?.youtubeVideoId).toBe('zzzzzzzzzzz')
  })
})
