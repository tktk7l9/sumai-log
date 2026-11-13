import { beforeEach, describe, expect, it, vi } from 'vitest'

import { channelVideos, vendors, videos, works } from '../db/schema'
import type { OEmbedResult } from './oembed'
import { quickAddVideo } from './quickVideo'
import { removeAddedVideo } from './repository'
import { actor, db, reset } from './repository/test-helpers'
import { quickVideoInput, quickVideoUndoInput } from './videos.schema'

beforeEach(reset)

const ID = 'dQw4w9WgXcQ'
const VENDOR_ID = '00000000-0000-4000-8000-000000000001'
const TODAY = '2026-11-13'

const found: OEmbedResult = {
  title: '平屋のルームツアー',
  channel: '甲チャンネル',
  thumbnailUrl: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`,
}
const lookUp = (hit: OEmbedResult | null) => vi.fn(async () => hit)

async function addChannelVideo(over: Partial<typeof channelVideos.$inferInsert> = {}) {
  await db.insert(vendors).values({ id: VENDOR_ID, name: '甲工務店', createdBy: actor })
  await db.insert(channelVideos).values({
    id: crypto.randomUUID(),
    videoId: ID,
    channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
    channel: '甲工務店の公式',
    vendorId: VENDOR_ID,
    kind: 'video',
    title: '構造見学会のようす',
    ...over,
  })
}

describe('quickAddVideo', () => {
  it('saves a video that is on no imported channel with what YouTube says about it', async () => {
    const look = lookUp(found)
    const result = await quickAddVideo(db, { videoId: ID, watchedOn: TODAY }, actor, look)

    expect(look).toHaveBeenCalledWith(ID)
    const [row] = await db.select().from(videos)
    expect(result).toEqual({
      status: 'saved',
      id: row?.id,
      title: '平屋のルームツアー',
      markedWatched: false,
    })
    expect(row).toMatchObject({
      url: `https://www.youtube.com/watch?v=${ID}`,
      videoId: ID,
      title: '平屋のルームツアー',
      channel: '甲チャンネル',
      thumbnailUrl: found.thumbnailUrl,
      watchedOn: TODAY,
      watchedBy: 'both',
      tags: [],
      takeaways: null,
      vendorId: null,
      createdBy: actor,
    })
  })

  it('takes title, channel and vendor from the imported channel video, without asking YouTube, and marks it watched', async () => {
    await addChannelVideo()
    await db.insert(works).values({
      id: crypto.randomUUID(),
      sourceUrl: 'https://example.com/works/p1/',
      site: 'siteA',
      title: 'テストの家',
      youtubeVideoId: ID,
    })
    const look = lookUp(found)
    const result = await quickAddVideo(db, { videoId: ID, watchedOn: TODAY }, actor, look)

    expect(look).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 'saved',
      title: '構造見学会のようす',
      markedWatched: true,
    })
    const [row] = await db.select().from(videos)
    expect(row).toMatchObject({
      title: '構造見学会のようす',
      channel: '甲工務店の公式',
      vendorId: VENDOR_ID,
      thumbnailUrl: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`,
    })
    const [channelVideo] = await db.select().from(channelVideos)
    const [work] = await db.select().from(works)
    expect(channelVideo?.watchedBy).toBe(actor)
    expect(work?.watchedBy).toBe(actor)
  })

  it('does not report a mark for a channel video that was already watched', async () => {
    await addChannelVideo({
      watchedAt: '2026-10-01T00:00:00.000Z',
      watchedBy: 'partner@example.com',
    })
    const result = await quickAddVideo(db, { videoId: ID, watchedOn: TODAY }, actor, lookUp(null))
    expect(result).toMatchObject({ status: 'saved', markedWatched: false })
    const [channelVideo] = await db.select().from(channelVideos)
    expect(channelVideo?.watchedBy).toBe('partner@example.com')
  })

  it('does not record the same video twice: it answers with the memo that is there', async () => {
    const first = await quickAddVideo(db, { videoId: ID, watchedOn: TODAY }, actor, lookUp(found))
    const look = lookUp(found)
    const second = await quickAddVideo(db, { videoId: ID, watchedOn: '2026-11-14' }, actor, look)

    expect(second).toEqual({
      status: 'exists',
      id: first.status === 'saved' ? first.id : '',
      title: '平屋のルームツアー',
    })
    expect(look).not.toHaveBeenCalled()
    expect(await db.select().from(videos)).toHaveLength(1)
  })

  it('saves nothing when the title cannot be read: the form takes over', async () => {
    const result = await quickAddVideo(db, { videoId: ID, watchedOn: TODAY }, actor, lookUp(null))
    expect(result).toEqual({ status: 'untitled', videoId: ID })
    expect(await db.select().from(videos)).toHaveLength(0)
  })
})

describe('removeAddedVideo', () => {
  it('removes the memo and takes back the watched marks it set', async () => {
    await addChannelVideo()
    const added = await quickAddVideo(db, { videoId: ID, watchedOn: TODAY }, actor, lookUp(null))
    if (added.status !== 'saved') throw new Error('not saved')

    await removeAddedVideo(db, added.id, added.markedWatched)

    expect(await db.select().from(videos)).toHaveLength(0)
    const [channelVideo] = await db.select().from(channelVideos)
    expect([channelVideo?.watchedAt, channelVideo?.watchedBy]).toEqual([null, null])
  })

  it('leaves a mark that was there before the memo', async () => {
    await addChannelVideo({ watchedAt: '2026-10-01T00:00:00.000Z', watchedBy: actor })
    const added = await quickAddVideo(db, { videoId: ID, watchedOn: TODAY }, actor, lookUp(null))
    if (added.status !== 'saved') throw new Error('not saved')

    await removeAddedVideo(db, added.id, added.markedWatched)

    expect(await db.select().from(videos)).toHaveLength(0)
    const [channelVideo] = await db.select().from(channelVideos)
    expect(channelVideo?.watchedAt).toBe('2026-10-01T00:00:00.000Z')
  })

  it('does nothing for a memo that is already gone', async () => {
    await addChannelVideo({ watchedAt: '2026-10-01T00:00:00.000Z', watchedBy: actor })
    await removeAddedVideo(db, crypto.randomUUID(), true)
    const [channelVideo] = await db.select().from(channelVideos)
    expect(channelVideo?.watchedAt).toBe('2026-10-01T00:00:00.000Z')
  })
})

describe('quickVideoInput', () => {
  it('reads the video id out of any YouTube link shape', () => {
    const result = quickVideoInput.safeParse({
      url: ` https://youtu.be/${ID}?si=abcDEF123 `,
      watchedOn: TODAY,
    })
    expect(result.success && result.data).toEqual({ videoId: ID, watchedOn: TODAY })
  })

  it('rejects a link that is not a YouTube video (path=url)', () => {
    const result = quickVideoInput.safeParse({ url: 'https://example.com/v', watchedOn: TODAY })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['url'])
      expect(result.error.issues[0]?.message).toBe('YouTube の URL を入れてください')
    }
  })

  it('rejects a day that is not a date, and an over-long link', () => {
    expect(
      quickVideoInput.safeParse({ url: `https://youtu.be/${ID}`, watchedOn: 'today' }).success,
    ).toBe(false)
    expect(
      quickVideoInput.safeParse({
        url: `https://youtu.be/${ID}?x=${'a'.repeat(500)}`,
        watchedOn: TODAY,
      }).success,
    ).toBe(false)
  })
})

describe('quickVideoUndoInput', () => {
  it('needs an id-shaped id and the flag', () => {
    expect(
      quickVideoUndoInput.safeParse({ id: crypto.randomUUID(), unmarkWatched: true }).success,
    ).toBe(true)
    expect(quickVideoUndoInput.safeParse({ id: 'x', unmarkWatched: true }).success).toBe(false)
    expect(quickVideoUndoInput.safeParse({ id: crypto.randomUUID() }).success).toBe(false)
  })
})
