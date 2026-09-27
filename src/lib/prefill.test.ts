import { describe, expect, it } from 'vitest'

import { buildVisitPrefill } from './prefill'

describe('buildVisitPrefill', () => {
  it('returns undefined without an event (the usual empty initial values stay)', () => {
    expect(buildVisitPrefill({}, null)).toBeUndefined()
    expect(buildVisitPrefill({ eventId: 'e1' }, null)).toBeUndefined()
  })

  it('uses place, vendor, property and date as initial values when there is an event', () => {
    expect(
      buildVisitPrefill(
        { eventId: 'e1' },
        {
          placeId: 'p1',
          vendorId: 'v1',
          propertyId: 'pr1',
          startsAt: '2030-01-05T10:00:00+09:00',
        },
      ),
    ).toEqual({
      eventId: 'e1',
      placeId: 'p1',
      vendorId: 'v1',
      propertyId: 'pr1',
      visitedOn: '2030-01-05',
    })
  })

  it('builds visitedOn even for an all-day event (date only, no time)', () => {
    expect(
      buildVisitPrefill(
        { eventId: 'e1' },
        { placeId: null, vendorId: null, propertyId: null, startsAt: '2030-01-05' },
      )?.visitedOn,
    ).toBe('2030-01-05')
  })

  it('P2-R8: returns null for an event with no place, vendor or property (does not overwrite with undefined)', () => {
    const result = buildVisitPrefill(
      { eventId: 'e1' },
      { placeId: null, vendorId: null, propertyId: null, startsAt: '2030-01-05' },
    )
    expect(result).toBeDefined()
    // null and undefined behave differently as Mantine useForm initial values, so check
    // explicitly that these have not turned into undefined (this was a real bug in the past)
    expect(result).toHaveProperty('placeId', null)
    expect(result).toHaveProperty('vendorId', null)
    expect(result).toHaveProperty('propertyId', null)
    expect(Object.prototype.hasOwnProperty.call(result, 'placeId')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(result, 'vendorId')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(result, 'propertyId')).toBe(true)
  })
})
