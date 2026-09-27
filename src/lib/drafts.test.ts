import { describe, expect, it } from 'vitest'

import { DRAFT_MAX_AGE_DAYS, draftKey, parseDraft, sameValues, serializeDraft } from './drafts'

describe('draftKey', () => {
  it('separates by kind, row and context', () => {
    expect(draftKey('visit', 'abc')).toBe('sumai-draft:visit:abc')
    expect(draftKey('visit', null)).toBe('sumai-draft:visit:new')
    expect(draftKey('visit', undefined, 'event1')).toBe('sumai-draft:visit:new:event1')
  })
})

describe('serializeDraft / parseDraft', () => {
  const now = 1_000_000_000_000
  it('reads back what was written', () => {
    expect(parseDraft(serializeDraft({ a: 1 }, now), now + 1000)).toEqual({ a: 1 })
  })

  it('returns null for an old, broken or differently shaped draft', () => {
    const day = 24 * 60 * 60 * 1000
    expect(
      parseDraft(serializeDraft({ a: 1 }, now), now + (DRAFT_MAX_AGE_DAYS + 1) * day),
    ).toBeNull()
    expect(parseDraft(null, now)).toBeNull()
    expect(parseDraft('{broken', now)).toBeNull()
    expect(parseDraft('null', now)).toBeNull()
    expect(parseDraft(JSON.stringify({ v: 2, savedAt: now, values: {} }), now)).toBeNull()
    expect(parseDraft(JSON.stringify({ v: 1, savedAt: 'x', values: {} }), now)).toBeNull()
    expect(parseDraft(JSON.stringify({ v: 1, savedAt: now }), now)).toBeNull()
    // A string draft (a comment) can be read too
    expect(parseDraft(serializeDraft('一言', now), now)).toBe('一言')
  })
})

describe('sameValues', () => {
  it('treats empty string, undefined and null as the same', () => {
    expect(sameValues({ a: '', b: null }, { a: null, b: undefined })).toBe(true)
    expect(sameValues({ a: 'x' }, { a: null })).toBe(false)
  })
})
