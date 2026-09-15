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
  it('新規作成は createdBy を記録し、更新では保たれる', async () => {
    const id = await upsertVideo(db, baseVideo({ title: 'A' }), actor)
    await upsertVideo(db, baseVideo({ id, title: 'B' }), 'partner@example.com')
    const [row] = await db.select().from(videos).where(eq(videos.id, id))
    expect(row.title).toBe('B')
    expect(row.createdBy).toBe(actor)
  })

  it('削除でコメントも消える', async () => {
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

  it('一覧は watchedOn desc, createdAt desc で業者名が付く（未観了は最後）', async () => {
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

  it('詳細は業者を含み、無ければ null。無い id は null', async () => {
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
