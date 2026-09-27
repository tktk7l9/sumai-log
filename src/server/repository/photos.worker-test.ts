import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { photos, visits } from '../../db/schema'
import { upsertPlace } from './places'
import {
  deletePhotoRow,
  insertPhoto,
  listPhotos,
  photoKeysOfVisit,
  reorderPhotoRows,
} from './photos'
import { actor, db, reset } from './test-helpers'

beforeEach(reset)

describe('photos', () => {
  it('sortOrder follows insertion order, delete returns the row, and the key list of a visit can be fetched', async () => {
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

  it('deleting a visit deletes photos by cascade', async () => {
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

describe('reorderPhotoRows', () => {
  async function seedVisitWithPhotos(n: number) {
    const visitId = crypto.randomUUID()
    await db.insert(visits).values({ id: visitId, visitedOn: '2030-01-05', createdBy: actor })
    const ids: string[] = []
    for (let i = 0; i < n; i += 1) {
      ids.push(
        await insertPhoto(
          db,
          {
            visitId,
            displayKey: `photos/z/${i}-display.jpg`,
            thumbKey: `photos/z/${i}-thumb.jpg`,
            width: 100,
            height: 100,
          },
          actor,
        ),
      )
    }
    return { visitId, ids }
  }

  it('renumbers sortOrder to 0,1,... in the given order and returns true', async () => {
    const { visitId, ids } = await seedVisitWithPhotos(3)
    const [a, b, c] = ids
    const ok = await reorderPhotoRows(db, visitId, [c, a, b])
    expect(ok).toBe(true)
    expect((await listPhotos(db, visitId)).map((p) => p.id)).toEqual([c, a, b])
  })

  it('does nothing and returns false when the count does not match (only some are passed)', async () => {
    const { visitId, ids } = await seedVisitWithPhotos(3)
    const before = (await listPhotos(db, visitId)).map((p) => p.id)
    const ok = await reorderPhotoRows(db, visitId, [ids[0]])
    expect(ok).toBe(false)
    expect((await listPhotos(db, visitId)).map((p) => p.id)).toEqual(before)
  })

  it('does nothing and returns false when a photo id of another visit record is mixed in (ownership check)', async () => {
    const { visitId, ids } = await seedVisitWithPhotos(2)
    const other = await seedVisitWithPhotos(1)
    const before = (await listPhotos(db, visitId)).map((p) => [p.id, p.sortOrder])
    const ok = await reorderPhotoRows(db, visitId, [ids[1], other.ids[0]])
    expect(ok).toBe(false)
    expect((await listPhotos(db, visitId)).map((p) => [p.id, p.sortOrder])).toEqual(before)
  })

  it('does nothing and returns false for an empty array', async () => {
    const { visitId } = await seedVisitWithPhotos(1)
    expect(await reorderPhotoRows(db, visitId, [])).toBe(false)
  })
})
