import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { comments, photos, properties, vendors, videos, visits } from '../../db/schema'
import { parseToUtcMs } from '../../lib/jst'
import { upsertVendor } from './candidates'
import { upsertEvent } from './events'
import {
  recentComments,
  recentEvents,
  recentPhotos,
  recentPlaces,
  recentProperties,
  recentSources,
  recentVendors,
  recentVideos,
  recentVisits,
} from './feed'
import { upsertPlace } from './places'
import { upsertSource } from './sources'
import { db, reset } from './test-helpers'
import { upsertVideo } from './videos'

const actorA = 'owner@example.com'

beforeEach(reset)

describe('recentVendors / recentProperties / recentPlaces / recentVideos', () => {
  it('a vendor has the name, kind label and href to the detail page', async () => {
    const id = await upsertVendor(
      db,
      { name: '乙建設', kind: 'koumuten', serviceAreas: [] },
      actorA,
    )
    const [item] = await recentVendors(db, 10)
    expect(item).toMatchObject({
      kind: 'vendor',
      id,
      title: '乙建設',
      subtitle: '工務店',
      by: actorA,
      href: { to: '/candidates/vendors/$id', params: { id } },
    })
  })

  it('a place has the kind label and href', async () => {
    const id = await upsertPlace(db, { name: 'モデルハウスA', kind: 'model_house' }, actorA)
    const [item] = await recentPlaces(db, 10)
    expect(item).toMatchObject({
      kind: 'place',
      id,
      title: 'モデルハウスA',
      subtitle: 'モデルハウス',
      href: { to: '/places/$id', params: { id } },
    })
  })

  it('a video has the title, channel and href to the video detail', async () => {
    const id = await upsertVideo(
      db,
      {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        videoId: 'dQw4w9WgXcQ',
        title: 'テスト動画',
        channel: 'テストch',
      },
      actorA,
    )
    const [item] = await recentVideos(db, 10)
    expect(item).toMatchObject({
      kind: 'video',
      id,
      title: 'テスト動画',
      subtitle: 'テストch',
      href: { to: '/records/videos/$id', params: { id } },
    })
  })

  it('narrows to at most n items', async () => {
    for (let i = 0; i < 3; i += 1) {
      await upsertVendor(db, { name: `業者${i}`, kind: 'koumuten', serviceAreas: [] }, actorA)
    }
    expect(await recentVendors(db, 2)).toHaveLength(2)
  })

  it('recentVideos is ordered newest updatedAt first (explicit timestamps)', async () => {
    await db.insert(videos).values([
      {
        id: crypto.randomUUID(),
        url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
        videoId: 'aaaaaaaaaaa',
        title: 'A',
        createdBy: actorA,
        updatedAt: '2030-01-01T00:00:00.000Z',
      },
      {
        id: crypto.randomUUID(),
        url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
        videoId: 'bbbbbbbbbbb',
        title: 'B',
        createdBy: actorA,
        updatedAt: '2030-01-03T00:00:00.000Z',
      },
      {
        id: crypto.randomUUID(),
        url: 'https://www.youtube.com/watch?v=ccccccccccc',
        videoId: 'ccccccccccc',
        title: 'C',
        createdBy: actorA,
        updatedAt: '2030-01-02T00:00:00.000Z',
      },
    ])
    const rows = await recentVideos(db, 10)
    expect(rows.map((r) => r.title)).toEqual(['B', 'C', 'A'])
  })

  it('a row updated by the repository upsert comes first and at is readable (same format for insert and update)', async () => {
    const oldId = await upsertVendor(
      db,
      { name: '古い方', kind: 'koumuten', serviceAreas: [] },
      actorA,
    )
    await db.update(vendors).set({ updatedAt: '2020-01-01 00:00:00' }).where(eq(vendors.id, oldId))

    const freshId = await upsertVendor(
      db,
      { name: '新しい方', kind: 'koumuten', serviceAreas: [] },
      actorA,
    )
    // Go through the update path (upsertVendor in repository/candidates.ts writes
    // updatedAt: sql`(datetime('now'))` = the same format as the datetime('now') default of insert)
    await upsertVendor(
      db,
      { id: freshId, name: '新しい方', kind: 'koumuten', serviceAreas: [] },
      actorA,
    )

    const rows = await recentVendors(db, 10)
    expect(rows[0].id).toBe(freshId)
    expect(parseToUtcMs(rows[0].at)).not.toBeNull()
    expect(parseToUtcMs(rows[0].at)).not.toBe(0)
    expect(rows.map((r) => r.id)).toEqual([freshId, oldId])
  })

  it('a row inserted later the same day and left untouched sorts before a row updated at an earlier real time (the formats match, so the order follows real time)', async () => {
    // Assumes insert uses D1's datetime('now') ('YYYY-MM-DD HH:MM:SS') and update is
    // written in the same format too.
    // Before the fix only the update side was ISO with milliseconds
    // ('YYYY-MM-DDTHH:MM:SS.sssZ'), and on the same date 'T' always sorts greater than a
    // space, so "the updated row" came first regardless of real time
    // (with the old implementation this test fails because rows[0] becomes updatedThenId).
    const todayKey = new Date().toISOString().slice(0, 10)
    const insertedLaterTodayId = crypto.randomUUID()
    await db.insert(vendors).values({
      id: insertedLaterTodayId,
      name: '同日の後刻に挿入されたまま',
      kind: 'koumuten',
      serviceAreas: [],
      createdBy: actorA,
      updatedAt: `${todayKey} 23:59:59`,
    })
    const updatedThenId = await upsertVendor(
      db,
      { name: '直前に更新', kind: 'koumuten', serviceAreas: [] },
      actorA,
    )
    await upsertVendor(
      db,
      { id: updatedThenId, name: '直前に更新', kind: 'koumuten', serviceAreas: [] },
      actorA,
    )

    const rows = await recentVendors(db, 10)
    const ats = rows.map((r) => parseToUtcMs(r.at))
    expect(ats.every((ms) => ms !== null)).toBe(true)
    for (let i = 1; i < ats.length; i += 1) {
      expect(ats[i - 1]!).toBeGreaterThanOrEqual(ats[i]!)
    }
    expect(rows[0].id).toBe(insertedLaterTodayId)
  })

  it('recentVideos too: a row inserted later the same day and left untouched sorts before a row updated just now', async () => {
    const todayKey = new Date().toISOString().slice(0, 10)
    const insertedLaterTodayId = crypto.randomUUID()
    await db.insert(videos).values({
      id: insertedLaterTodayId,
      url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      videoId: 'aaaaaaaaaaa',
      title: '同日の後刻に挿入されたまま',
      createdBy: actorA,
      updatedAt: `${todayKey} 23:59:59`,
    })
    const updatedThenId = await upsertVideo(
      db,
      {
        url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
        videoId: 'bbbbbbbbbbb',
        title: '直前に更新',
      },
      actorA,
    )
    await upsertVideo(
      db,
      {
        id: updatedThenId,
        url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
        videoId: 'bbbbbbbbbbb',
        title: '直前に更新',
      },
      actorA,
    )

    const rows = await recentVideos(db, 10)
    const ats = rows.map((r) => parseToUtcMs(r.at))
    expect(ats.every((ms) => ms !== null)).toBe(true)
    for (let i = 1; i < ats.length; i += 1) {
      expect(ats[i - 1]!).toBeGreaterThanOrEqual(ats[i]!)
    }
    expect(rows[0].id).toBe(insertedLaterTodayId)
  })
})

describe('action (add/update)', () => {
  it('add right after insertion (createdAt and updatedAt are nearly the same time)', async () => {
    await upsertVendor(db, { name: '新規業者', kind: 'koumuten', serviceAreas: [] }, actorA)
    const [item] = await recentVendors(db, 10)
    expect(item.action).toBe('add')
  })

  it('a row updated by the repository upsert 5 minutes later is update', async () => {
    const id = crypto.randomUUID()
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ')
    await db.insert(vendors).values({
      id,
      name: '更新される業者',
      kind: 'koumuten',
      serviceAreas: [],
      createdBy: actorA,
      createdAt: fiveMinAgo,
      updatedAt: fiveMinAgo,
    })
    // Go through the update path (upsertVendor in repository/candidates.ts rewrites
    // updatedAt to the current time with sql`(datetime('now'))`. createdAt is not touched)
    await upsertVendor(
      db,
      { id, name: '更新される業者', kind: 'koumuten', serviceAreas: [] },
      actorA,
    )
    const [item] = await recentVendors(db, 10)
    expect(item.id).toBe(id)
    expect(item.action).toBe('update')
  })
})

describe('recentVisits / recentEvents', () => {
  it('a visit record uses the place name as title, visitedOn as subtitle, and href is the visit record detail', async () => {
    const placeId = await upsertPlace(db, { name: 'ギャラリーB', kind: 'gallery' }, actorA)
    const visitId = crypto.randomUUID()
    await db.insert(visits).values({
      id: visitId,
      placeId,
      visitedOn: '2030-01-05',
      createdBy: actorA,
    })
    const [item] = await recentVisits(db, 10)
    expect(item).toMatchObject({
      kind: 'visit',
      id: visitId,
      title: 'ギャラリーB',
      subtitle: '2030-01-05',
      href: { to: '/records/visits/$id', params: { id: visitId } },
    })
  })

  it('a visit record with no linked place gets the title "見学記録" (visit record)', async () => {
    const visitId = crypto.randomUUID()
    await db.insert(visits).values({ id: visitId, visitedOn: '2030-01-05', createdBy: actorA })
    const [item] = await recentVisits(db, 10)
    expect(item.title).toBe('見学記録')
  })

  it('recentVisits is ordered newest updatedAt first (explicit timestamps)', async () => {
    await db.insert(visits).values([
      {
        id: crypto.randomUUID(),
        visitedOn: '2030-01-01',
        createdBy: actorA,
        updatedAt: '2030-01-01T00:00:00.000Z',
      },
      {
        id: crypto.randomUUID(),
        visitedOn: '2030-01-01',
        createdBy: actorA,
        updatedAt: '2030-01-03T00:00:00.000Z',
      },
      {
        id: crypto.randomUUID(),
        visitedOn: '2030-01-01',
        createdBy: actorA,
        updatedAt: '2030-01-02T00:00:00.000Z',
      },
    ])
    const rows = await recentVisits(db, 10)
    expect(rows.map((r) => r.at)).toEqual([
      '2030-01-03T00:00:00.000Z',
      '2030-01-02T00:00:00.000Z',
      '2030-01-01T00:00:00.000Z',
    ])
  })

  it('an event puts the date in href.search to /calendar (not in params)', async () => {
    const id = await upsertEvent(
      db,
      {
        title: '見学会',
        kind: 'visit',
        startsAt: '2030-02-03T10:00:00+09:00',
        endsAt: null,
        allDay: false,
      },
      actorA,
    )
    const [item] = await recentEvents(db, 10)
    expect(item).toMatchObject({
      kind: 'event',
      id,
      title: '見学会',
      href: { to: '/calendar', search: { d: '2030-02-03' } },
    })
    expect(item.href.params).toBeUndefined()
  })
})

describe('recentComments', () => {
  it('JOINs the target name into subtitle, and href becomes the page of the target', async () => {
    const vendorId = await upsertVendor(
      db,
      { name: '丙建設', kind: 'koumuten', serviceAreas: [] },
      actorA,
    )
    const commentId = crypto.randomUUID()
    await db.insert(comments).values({
      id: commentId,
      targetType: 'vendor',
      targetId: vendorId,
      body: '感想です',
      createdBy: actorA,
    })
    const [item] = await recentComments(db, 10)
    expect(item).toMatchObject({
      kind: 'comment',
      id: commentId,
      title: '感想です',
      subtitle: '丙建設',
      href: { to: '/candidates/vendors/$id', params: { id: vendorId } },
    })
  })

  it('when the target is deleted, subtitle becomes "（削除済み）" (deleted) (the id in href stays the original targetId)', async () => {
    const goneId = crypto.randomUUID()
    const commentId = crypto.randomUUID()
    await db.insert(comments).values({
      id: commentId,
      targetType: 'place',
      targetId: goneId,
      body: '消えた対象への一言',
      createdBy: actorA,
    })
    const [item] = await recentComments(db, 10)
    expect(item.subtitle).toBe('（削除済み）')
    expect(item.href).toEqual({ to: '/places/$id', params: { id: goneId } })
  })

  it('href of a video comment is the video detail, and does not leak to vendors or places', async () => {
    const videoId = await upsertVideo(
      db,
      {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        videoId: 'dQw4w9WgXcQ',
        title: '動画X',
      },
      actorA,
    )
    const vendorId = await upsertVendor(
      db,
      { name: '同じ形式の業者', kind: 'koumuten', serviceAreas: [] },
      actorA,
    )
    await db.insert(comments).values([
      {
        id: crypto.randomUUID(),
        targetType: 'video',
        targetId: videoId,
        body: '動画への一言',
        createdBy: actorA,
      },
      {
        id: crypto.randomUUID(),
        targetType: 'vendor',
        targetId: vendorId,
        body: '業者への一言',
        createdBy: actorA,
      },
    ])
    const items = await recentComments(db, 10)
    // Check that the kind of href does not disagree with targetType (ids of other kinds do not mix in)
    const byTitle = (t: string) => items.find((i) => i.title === t)!
    expect(byTitle('動画への一言').href).toEqual({
      to: '/records/videos/$id',
      params: { id: videoId },
    })
    expect(byTitle('業者への一言').href).toEqual({
      to: '/candidates/vendors/$id',
      params: { id: vendorId },
    })
  })
})

describe('recentPhotos', () => {
  it('a photo uses caption as title, at is createdAt, and href is the visit record detail', async () => {
    const placeId = await upsertPlace(db, { name: 'ギャラリーC', kind: 'gallery' }, actorA)
    const visitId = crypto.randomUUID()
    await db.insert(visits).values({
      id: visitId,
      placeId,
      visitedOn: '2030-01-05',
      createdBy: actorA,
    })
    const photoId = crypto.randomUUID()
    await db.insert(photos).values({
      id: photoId,
      visitId,
      displayKey: 'photos/x/display.jpg',
      thumbKey: 'photos/x/thumb.jpg',
      width: 100,
      height: 100,
      caption: '外観',
      createdBy: actorA,
    })
    const [item] = await recentPhotos(db, 10)
    expect(item).toMatchObject({
      kind: 'photo',
      id: photoId,
      title: '外観',
      subtitle: 'ギャラリーC',
      href: { to: '/records/visits/$id', params: { id: visitId } },
    })
  })

  it('becomes "写真" (photo) when there is no caption', async () => {
    const visitId = crypto.randomUUID()
    await db.insert(visits).values({ id: visitId, visitedOn: '2030-01-05', createdBy: actorA })
    await db.insert(photos).values({
      id: crypto.randomUUID(),
      visitId,
      displayKey: 'photos/x/display.jpg',
      thumbKey: 'photos/x/thumb.jpg',
      width: 100,
      height: 100,
      createdBy: actorA,
    })
    const [item] = await recentPhotos(db, 10)
    expect(item.title).toBe('写真')
  })
})

describe('recentProperties', () => {
  it('a property uses the address as subtitle and has href to the detail', async () => {
    const id = crypto.randomUUID()
    await db.insert(properties).values({
      id,
      name: 'ワイズマンション',
      address: '東京都渋谷区',
      createdBy: actorA,
    })
    const [item] = await recentProperties(db, 10)
    expect(item).toMatchObject({
      kind: 'property',
      id,
      title: 'ワイズマンション',
      subtitle: '東京都渋谷区',
      href: { to: '/candidates/properties/$id', params: { id } },
    })
  })
})

describe('recentSources', () => {
  it('a source uses the name as title, handle as subtitle, and has href to the list (/sources)', async () => {
    const id = await upsertSource(
      db,
      {
        kind: 'youtube',
        name: 'テストチャンネル',
        url: 'https://www.youtube.com/@example-house',
        handle: '@example-house',
        channelId: null,
        genre: 'knowledge',
        description: null,
        avatarUrl: null,
        vendorId: null,
        affiliation: null,
        sortOrder: 0,
      },
      actorA,
    )
    const [item] = await recentSources(db, 10)
    expect(item).toMatchObject({
      kind: 'source',
      id,
      title: 'テストチャンネル',
      subtitle: '@example-house',
      by: actorA,
      href: { to: '/sources' },
    })
  })

  it('subtitle is undefined when there is no handle', async () => {
    await upsertSource(
      db,
      {
        kind: 'site',
        name: 'テストサイト',
        url: 'https://example.com',
        handle: null,
        channelId: null,
        genre: 'knowledge',
        description: null,
        avatarUrl: null,
        vendorId: null,
        affiliation: null,
        sortOrder: 0,
      },
      actorA,
    )
    const [item] = await recentSources(db, 10)
    expect(item.subtitle).toBeUndefined()
  })
})
