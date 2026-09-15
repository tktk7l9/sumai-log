import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { events, visits } from '../../db/schema'
import { upsertVendor } from './candidates'
import { deleteEvent, listEventsBetween, listEventsWithLinks, upsertEvent } from './events'
import { upsertPlace } from './places'
import { actor, db, reset } from './test-helpers'
import { listRecordedEventIds } from './visits'

beforeEach(reset)

describe('events', () => {
  it('範囲検索は日付キーで比較し、終日と時刻ありが混ざっても開始順', async () => {
    await upsertEvent(
      db,
      {
        title: '見学A',
        kind: 'visit',
        startsAt: '2030-01-05T13:00:00+09:00',
        endsAt: null,
        allDay: false,
      },
      actor,
    )
    await upsertEvent(
      db,
      { title: '終日B', kind: 'other', startsAt: '2030-01-05', endsAt: null, allDay: true },
      actor,
    )
    await upsertEvent(
      db,
      { title: '来月', kind: 'visit', startsAt: '2030-02-01', endsAt: null, allDay: true },
      actor,
    )
    const rows = await listEventsBetween(db, '2030-01-01', '2030-01-31')
    expect(rows.map((r) => r.title)).toEqual(['終日B', '見学A'])
  })

  it('更新は createdBy を保ち、削除で見学記録の eventId が外れる', async () => {
    const id = await upsertEvent(
      db,
      { title: 'X', kind: 'visit', startsAt: '2030-01-05', endsAt: null, allDay: true },
      actor,
    )
    await upsertEvent(
      db,
      { id, title: 'Y', kind: 'meeting', startsAt: '2030-01-06', endsAt: null, allDay: true },
      'partner@example.com',
    )
    const [row] = await db.select().from(events).where(eq(events.id, id))
    expect(row.title).toBe('Y')
    expect(row.createdBy).toBe(actor)
    await db
      .insert(visits)
      .values({ id: crypto.randomUUID(), eventId: id, visitedOn: '2030-01-06', createdBy: actor })
    expect(await listRecordedEventIds(db)).toEqual(new Set([id]))
    await deleteEvent(db, id)
    const [visit] = await db.select().from(visits)
    expect(visit.eventId).toBeNull()
  })

  it('一覧に場所名・業者名が付く', async () => {
    const vendorId = await upsertVendor(
      db,
      { name: '甲工務店', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    const placeId = await upsertPlace(
      db,
      { name: 'テスト展示場', kind: 'showroom', vendorId },
      actor,
    )
    await upsertEvent(
      db,
      {
        title: 'E',
        kind: 'visit',
        startsAt: '2030-01-05',
        endsAt: null,
        allDay: true,
        placeId,
        vendorId,
      },
      actor,
    )
    const [row] = await listEventsWithLinks(db, '2030-01-01', '2030-01-31')
    expect([row.placeName, row.vendorName, row.propertyName]).toEqual([
      'テスト展示場',
      '甲工務店',
      null,
    ])
  })
})
