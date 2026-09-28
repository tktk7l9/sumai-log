import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { comments, videos, type NewVideo } from '../../db/schema'
import { upsertVendor } from './candidates'
import { actor, db, reset } from './test-helpers'
import { deleteVideoCascade, getVideoDetail, listVideosWithLinks, upsertVideo } from './videos'

beforeEach(reset)

type VideoSeed = Omit<NewVideo, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & { id?: string }

const baseVideo = (overrides: Partial<VideoSeed> = {}): VideoSeed => ({
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  videoId: 'dQw4w9WgXcQ',
  title: 'テスト動画',
  ...overrides,
})

describe('videos', () => {
  it('create records createdBy, and update keeps it', async () => {
    const id = await upsertVideo(db, baseVideo({ title: 'A' }), actor)
    await upsertVideo(db, baseVideo({ id, title: 'B' }), 'partner@example.com')
    const [row] = await db.select().from(videos).where(eq(videos.id, id))
    expect(row.title).toBe('B')
    expect(row.createdBy).toBe(actor)
  })

  it('deletion deletes comments too', async () => {
    const id = await upsertVideo(db, baseVideo(), actor)
    await db.insert(comments).values({
      id: crypto.randomUUID(),
      targetType: 'video',
      targetId: id,
      body: '一言',
      createdBy: actor,
    })
    expect(await db.select().from(comments)).toHaveLength(1)
    await deleteVideoCascade(db, id)
    expect(await db.select().from(videos)).toHaveLength(0)
    expect(await db.select().from(comments)).toHaveLength(0)
  })

  it('the list is watchedOn desc, createdAt desc and carries the vendor name (unwatched come last)', async () => {
    const vendorId = await upsertVendor(
      db,
      { name: '乙建設', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    await upsertVideo(db, baseVideo({ title: 'A', watchedOn: '2030-01-01', vendorId }), actor)
    await upsertVideo(db, baseVideo({ title: 'B', watchedOn: '2030-01-05' }), actor)
    await upsertVideo(db, baseVideo({ title: 'C', watchedOn: null }), actor)
    const rows = await listVideosWithLinks(db)
    expect(rows.map((r) => [r.title, r.vendorName])).toEqual([
      ['B', null],
      ['A', '乙建設'],
      ['C', null],
    ])
  })

  it('the detail includes the vendor, or null if none. A missing id is null', async () => {
    const vendorId = await upsertVendor(
      db,
      { name: '甲工務店', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    const withVendor = await upsertVideo(db, baseVideo({ vendorId }), actor)
    const withoutVendor = await upsertVideo(db, baseVideo(), actor)
    expect(await getVideoDetail(db, withVendor)).toEqual({
      video: expect.objectContaining({ id: withVendor }),
      vendor: { id: vendorId, name: '甲工務店' },
    })
    expect(await getVideoDetail(db, withoutVendor)).toEqual({
      video: expect.objectContaining({ id: withoutVendor }),
      vendor: null,
    })
    expect(await getVideoDetail(db, crypto.randomUUID())).toBeNull()
  })
})
