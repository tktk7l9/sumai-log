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
  recentVendors,
  recentVideos,
  recentVisits,
} from './feed'
import { upsertPlace } from './places'
import { db, reset } from './test-helpers'
import { upsertVideo } from './videos'

const actorA = 'owner@example.com'

beforeEach(reset)

describe('recentVendors / recentProperties / recentPlaces / recentVideos', () => {
  it('業者は名前・kind ラベル・詳細ページへの href を持つ', async () => {
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

  it('場所は kind ラベルと href を持つ', async () => {
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

  it('動画は題名・チャンネルと動画詳細への href を持つ', async () => {
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

  it('n 件までに絞る', async () => {
    for (let i = 0; i < 3; i += 1) {
      await upsertVendor(db, { name: `業者${i}`, kind: 'koumuten', serviceAreas: [] }, actorA)
    }
    expect(await recentVendors(db, 2)).toHaveLength(2)
  })

  it('recentVideos は updatedAt の新しい順（明示タイムスタンプ）', async () => {
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

  it('リポジトリの upsert で更新された行が先頭に来て at が読める（挿入・更新とも同じ書式）', async () => {
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
    // 更新経路を通す（repository/candidates.ts の upsertVendor は
    // updatedAt: sql`(datetime('now'))` を書く＝挿入の datetime('now') 既定値と同じ書式になる）
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

  it('同じ日の後刻に挿入されたまま触れていない行が、それより前の実時刻に更新された行より先に並ぶ（書式が揃っているので実時刻どおりになる）', async () => {
    // 挿入は D1 の datetime('now')（'YYYY-MM-DD HH:MM:SS'）、更新も同じ書式で書かれる前提。
    // 修正前は更新側だけミリ秒付き ISO（'YYYY-MM-DDTHH:MM:SS.sssZ'）で、同じ日付なら
    // 'T' が常に空白より大きく並ぶため、実時刻に関わらず「更新した行」が先頭に来ていた
    // （このテストは旧実装なら rows[0] が updatedThenId になり失敗する）。
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

  it('recentVideos も同じ日の後刻に挿入されたまま触れていない行が、直前に更新した行より先に並ぶ', async () => {
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

describe('action（add/update）', () => {
  it('挿入直後は add（createdAt と updatedAt がほぼ同時刻）', async () => {
    await upsertVendor(db, { name: '新規業者', kind: 'koumuten', serviceAreas: [] }, actorA)
    const [item] = await recentVendors(db, 10)
    expect(item.action).toBe('add')
  })

  it('5 分後にリポジトリの upsert で更新された行は update', async () => {
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
    // 更新経路を通す（updatedAt は repository/candidates.ts の upsertVendor が
    // sql`(datetime('now'))` で現在時刻に書き換える。createdAt は触らない）
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
  it('見学記録は場所名を題名に、visitedOn を副題に、href は見学記録詳細', async () => {
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

  it('場所の紐付けが無い見学記録は題名が「見学記録」になる', async () => {
    const visitId = crypto.randomUUID()
    await db.insert(visits).values({ id: visitId, visitedOn: '2030-01-05', createdBy: actorA })
    const [item] = await recentVisits(db, 10)
    expect(item.title).toBe('見学記録')
  })

  it('recentVisits は updatedAt の新しい順（明示タイムスタンプ）', async () => {
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

  it('予定は /calendar への href.search に日付が入る（params ではない）', async () => {
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
  it('対象の名前を JOIN して subtitle にし、href は対象のページになる', async () => {
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

  it('対象が削除済みなら subtitle が「（削除済み）」になる（href の id は元の targetId のまま）', async () => {
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

  it('動画コメントの href は動画詳細で、業者や場所には漏れない', async () => {
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
    // href の kind が targetType と食い違っていない（他 kind の id が混ざらない）ことを確認する
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
  it('写真は caption を題名に、at は createdAt、href は見学記録詳細', async () => {
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

  it('caption が無ければ「写真」になる', async () => {
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
  it('物件は住所を副題に、詳細への href を持つ', async () => {
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
