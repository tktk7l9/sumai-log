import { describe, expect, it } from 'vitest'

import { EMPTY_FIELDS } from './types'

describe('EMPTY_FIELDS', () => {
  it('has every field unknown, so a parser result can be laid over it', () => {
    expect(EMPTY_FIELDS.points).toEqual([])
    expect(Object.values(EMPTY_FIELDS).filter((value) => value !== null)).toEqual([[]])
  })
})
