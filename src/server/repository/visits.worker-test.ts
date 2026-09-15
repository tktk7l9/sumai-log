import { beforeEach, describe, expect, it } from 'vitest'

import { photos, visits } from '../../db/schema'
import { upsertVendor } from './candidates'
import { insertPhoto } from './photos'
import { upsertPlace } from './places'
import { actor, db, reset } from './test-helpers'
import {
  deleteVisitCascade,
  getVisitDetail,
  hasVisits,
  listVisitsWithLinks,
  upsertVisit,
} from './visits'

beforeEach(reset)

describe('visits', () => {
  it('一覧は新しい順で場所名・写真数・先頭サムネが付き、削除で R2 キーを返す', async () => {
    const placeId = await upsertPlace(db, { name: 'テスト会場', kind: 'open_house' }, actor)
    const older = await upsertVisit(
      db,
      { placeId, visitedOn: '2030-01-05', attendees: 'both' },
      actor,
    )
    const newer = await upsertVisit(
      db,
      { placeId, visitedOn: '2030-01-08', attendees: 'wife' },
      actor,
    )
    await insertPhoto(
      db,
      {
        visitId: older,
        displayKey: 'photos/o/1-display.jpg',
        thumbKey: 'photos/o/1-thumb.jpg',
        width: 10,
        height: 10,
      },
      actor,
    )
    await insertPhoto(
      db,
      {
        visitId: older,
        displayKey: 'photos/o/2-display.jpg',
        thumbKey: 'photos/o/2-thumb.jpg',
        width: 10,
        height: 10,
      },
      actor,
    )
    const rows = await listVisitsWithLinks(db)
    expect(rows.map((r) => [r.id, r.placeName, r.photoCount, r.firstThumbKey])).toEqual([
      [newer, 'テスト会場', 0, null],
      [older, 'テスト会場', 2, 'photos/o/1-thumb.jpg'],
    ])
    const keys = await deleteVisitCascade(db, older)
    expect(keys.sort()).toEqual([
      'photos/o/1-display.jpg',
      'photos/o/1-thumb.jpg',
      'photos/o/2-display.jpg',
      'photos/o/2-thumb.jpg',
    ])
    expect(await db.select().from(photos)).toHaveLength(0)
  })

  it('詳細は関連と写真をまとめて返し、無ければ null', async () => {
    const vendorId = await upsertVendor(
      db,
      { name: '甲工務店', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    const id = await upsertVisit(
      db,
      { vendorId, visitedOn: '2030-01-05', attendees: 'husband', good: 'よかった' },
      actor,
    )
    const d = await getVisitDetail(db, id)
    expect(d?.visit.good).toBe('よかった')
    expect(d?.vendor?.name).toBe('甲工務店')
    expect(d?.place).toBeNull()
    expect(d?.photos).toEqual([])
    expect(await getVisitDetail(db, crypto.randomUUID())).toBeNull()
  })

  it('hasVisits は見学記録の有無を返す', async () => {
    const placeId = await upsertPlace(db, { name: 'テスト展示場2', kind: 'showroom' }, actor)
    expect(await hasVisits(db, placeId)).toBe(false)
    await db
      .insert(visits)
      .values({ id: crypto.randomUUID(), placeId, visitedOn: '2030-01-01', createdBy: actor })
    expect(await hasVisits(db, placeId)).toBe(true)
  })
})
