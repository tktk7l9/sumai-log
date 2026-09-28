import { describe, expect, it } from 'vitest'

import { vendorSpecHalves } from './vendorSpecs'

const empty = {
  uaValue: null,
  cValuePublished: false,
  seismicGrade: null,
  longTermCertified: false,
}

describe('vendorSpecHalves', () => {
  it('returns null halves for a vendor with nothing registered (the rows are dropped)', () => {
    expect(vendorSpecHalves(empty)).toEqual({
      ua: null,
      c: null,
      seismic: null,
      longTerm: null,
    })
  })

  it('does not claim 「非公開」 (not published) when C-value publication is only unchecked', () => {
    // false means "nobody has confirmed it yet" as much as "confirmed not public" (SHIG 56)
    expect(vendorSpecHalves({ ...empty, uaValue: 0.46 }).c).toBeNull()
  })

  it('formats the halves that are present', () => {
    expect(
      vendorSpecHalves({
        uaValue: 0.46,
        cValuePublished: true,
        seismicGrade: 3,
        longTermCertified: true,
      }),
    ).toEqual({ ua: '0.46', c: '実測公開', seismic: '3', longTerm: '対応' })
  })

  it('keeps a UA value of 0 (a number, not "missing")', () => {
    expect(vendorSpecHalves({ ...empty, uaValue: 0 }).ua).toBe('0')
  })
})
