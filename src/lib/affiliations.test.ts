import { describe, expect, it } from 'vitest'

import { findAffiliation, resolveAffiliations } from './affiliations'

// AFFILIATIONS is fixed data of only 3 ids (by spec, the names and URLs of the real
// organizations are promised to stay in the code).
// Only the check of "unknown id" uses a fictional value.

describe('findAffiliation', () => {
  it('looks up an organization by id', () => {
    expect(findAffiliation('iedukuri100')?.shortName).toBe('家百')
    expect(findAffiliation('miratsugu')?.shortName).toBe('みらつぐ')
  })

  it('returns null for an unknown id', () => {
    expect(findAffiliation('unknown-org')).toBeNull()
  })
})

describe('resolveAffiliations', () => {
  it('resolves an array of ids to organizations (keeps the given order)', () => {
    expect(resolveAffiliations(['miratsugu', 'iedukuri100']).map((a) => a.id)).toEqual([
      'miratsugu',
      'iedukuri100',
    ])
  })

  it('silently drops unknown ids', () => {
    expect(resolveAffiliations(['iedukuri100', 'unknown-org']).map((a) => a.id)).toEqual([
      'iedukuri100',
    ])
  })

  it('removes duplicates (keeps the position of the first occurrence)', () => {
    expect(
      resolveAffiliations(['iedukuri100', 'iedukuri100', 'miratsugu']).map((a) => a.id),
    ).toEqual(['iedukuri100', 'miratsugu'])
  })

  it('returns an empty array for an empty array', () => {
    expect(resolveAffiliations([])).toEqual([])
  })
})
