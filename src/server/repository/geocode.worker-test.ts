import { beforeEach, describe, expect, it } from 'vitest'

import { getCachedGeocode, putCachedGeocode } from './geocode'
import { db, reset } from './test-helpers'

beforeEach(reset)

describe('geocode cache', () => {
  it('the same string overwrites and stays 1 row', async () => {
    expect(await getCachedGeocode(db, 'テスト市')).toBeNull()
    await putCachedGeocode(db, 'テスト市', { lat: 35, lng: 139, title: 'テスト市' })
    await putCachedGeocode(db, 'テスト市', { lat: 36, lng: 140, title: null })
    expect(await getCachedGeocode(db, 'テスト市')).toEqual({ lat: 36, lng: 140, title: null })
  })
})
