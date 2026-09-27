import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { places, visits } from '../../db/schema'
import { upsertVendor } from './candidates'
import { deletePlaceCascade, listPlacesWithLinks, upsertPlace } from './places'
import { actor, db, reset } from './test-helpers'

beforeEach(reset)

describe('places', () => {
  it('a place with visit records cannot be deleted', async () => {
    const placeId = await upsertPlace(db, { name: 'テスト会場', kind: 'open_house' }, actor)
    await db
      .insert(visits)
      .values({ id: crypto.randomUUID(), placeId, visitedOn: '2030-01-01', createdBy: actor })
    expect(await deletePlaceCascade(db, placeId)).toEqual({ ok: false, reason: 'has_visits' })
    expect(await db.select().from(places).where(eq(places.id, placeId))).toHaveLength(1)
  })

  it('the list for the map carries the vendor name and the visited flag', async () => {
    const vendorId = await upsertVendor(
      db,
      { name: '乙建設', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    const visitedId = await upsertPlace(
      db,
      { name: 'A', kind: 'model_house', vendorId, lat: 35, lng: 139 },
      actor,
    )
    await upsertPlace(db, { name: 'B', kind: 'showroom' }, actor)
    await db.insert(visits).values({
      id: crypto.randomUUID(),
      placeId: visitedId,
      visitedOn: '2030-01-01',
      createdBy: actor,
    })
    const rows = await listPlacesWithLinks(db)
    expect(rows.map((r) => [r.name, r.vendorName, r.visited])).toEqual([
      ['A', '乙建設', true],
      ['B', null, false],
    ])
  })
})
