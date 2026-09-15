import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { photos, visits } from '../../db/schema'
import { upsertPlace } from './places'
import { deletePhotoRow, insertPhoto, listPhotos, photoKeysOfVisit } from './photos'
import { actor, db, reset } from './test-helpers'

beforeEach(reset)

describe('photos', () => {
  it('sortOrder は追加順、削除は行を返し、visit のキー一覧が取れる', async () => {
    const placeId = await upsertPlace(db, { name: 'テスト会場', kind: 'open_house' }, actor)
    const visitId = crypto.randomUUID()
    await db
      .insert(visits)
      .values({ id: visitId, placeId, visitedOn: '2030-01-05', createdBy: actor })
    const a = await insertPhoto(
      db,
      {
        visitId,
        displayKey: 'photos/x/a-display.jpg',
        thumbKey: 'photos/x/a-thumb.jpg',
        width: 1600,
        height: 1200,
      },
      actor,
    )
    const b = await insertPhoto(
      db,
      {
        visitId,
        displayKey: 'photos/x/b-display.jpg',
        thumbKey: 'photos/x/b-thumb.jpg',
        width: 1200,
        height: 1600,
      },
      actor,
    )
    expect((await listPhotos(db, visitId)).map((p) => [p.id, p.sortOrder])).toEqual([
      [a, 0],
      [b, 1],
    ])
    expect((await photoKeysOfVisit(db, visitId)).sort()).toEqual([
      'photos/x/a-display.jpg',
      'photos/x/a-thumb.jpg',
      'photos/x/b-display.jpg',
      'photos/x/b-thumb.jpg',
    ])
    const removed = await deletePhotoRow(db, a)
    expect(removed?.displayKey).toBe('photos/x/a-display.jpg')
    expect(await deletePhotoRow(db, a)).toBeNull()
    expect((await listPhotos(db, visitId)).map((p) => p.id)).toEqual([b])

    const c = await insertPhoto(
      db,
      {
        visitId,
        displayKey: 'photos/x/c-display.jpg',
        thumbKey: 'photos/x/c-thumb.jpg',
        width: 800,
        height: 600,
      },
      actor,
    )
    expect((await listPhotos(db, visitId)).map((p) => [p.id, p.sortOrder])).toEqual([
      [b, 1],
      [c, 2],
    ])
  })

  it('visit を消すと photos は cascade で消える', async () => {
    const visitId = crypto.randomUUID()
    await db.insert(visits).values({ id: visitId, visitedOn: '2030-01-05', createdBy: actor })
    await insertPhoto(
      db,
      {
        visitId,
        displayKey: 'photos/y/c-display.jpg',
        thumbKey: 'photos/y/c-thumb.jpg',
        width: 10,
        height: 10,
      },
      actor,
    )
    await db.delete(visits).where(eq(visits.id, visitId))
    expect(await db.select().from(photos)).toHaveLength(0)
  })
})
