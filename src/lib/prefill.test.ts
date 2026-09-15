import { describe, expect, it } from 'vitest'

import { buildVisitPrefill } from './prefill'

describe('buildVisitPrefill', () => {
  it('event が無ければ undefined（通常の空初期値のまま）', () => {
    expect(buildVisitPrefill({}, null)).toBeUndefined()
    expect(buildVisitPrefill({ eventId: 'e1' }, null)).toBeUndefined()
  })

  it('event があれば場所・業者・物件・日付を初期値にする', () => {
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

  it('終日予定（時刻無しの日付のみ）でも visitedOn を組み立てられる', () => {
    expect(
      buildVisitPrefill(
        { eventId: 'e1' },
        { placeId: null, vendorId: null, propertyId: null, startsAt: '2030-01-05' },
      )?.visitedOn,
    ).toBe('2030-01-05')
  })

  it('P2-R8: 場所・業者・物件が未設定の予定では null を返す（undefined で上書きしない）', () => {
    const result = buildVisitPrefill(
      { eventId: 'e1' },
      { placeId: null, vendorId: null, propertyId: null, startsAt: '2030-01-05' },
    )
    expect(result).toBeDefined()
    // null と undefined は Mantine useForm の初期値で挙動が異なるため、
    // ここが undefined に化けていないことを明示的に確認する（過去に実バグがあった）
    expect(result).toHaveProperty('placeId', null)
    expect(result).toHaveProperty('vendorId', null)
    expect(result).toHaveProperty('propertyId', null)
    expect(Object.prototype.hasOwnProperty.call(result, 'placeId')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(result, 'vendorId')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(result, 'propertyId')).toBe(true)
  })
})
