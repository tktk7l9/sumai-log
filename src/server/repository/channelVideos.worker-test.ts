import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { channelVideos, vendors, works, type NewChannelVideo } from '../../db/schema'
import { channelVideoUpsertSql, type ParsedChannelVideo } from '../../lib/channelVideos/import'
import { channelSummaries, listChannelVideos, setChannelVideoWatched } from './channelVideos'
import { actor, db, reset } from './test-helpers'
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
    expect(await channelSummaries(db)).toEqual([
      { channelId: CH_B, channel: '乙の会', total: 1, watched: 0 },
      { channelId: CH_A, channel: '甲工務店', total: 2, watched: 1 },
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
