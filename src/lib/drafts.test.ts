import { describe, expect, it } from 'vitest'

import { DRAFT_MAX_AGE_DAYS, draftKey, parseDraft, sameValues, serializeDraft } from './drafts'

describe('draftKey', () => {
  it('種類・行・文脈で分ける', () => {
    expect(draftKey('visit', 'abc')).toBe('sumai-draft:visit:abc')
    expect(draftKey('visit', null)).toBe('sumai-draft:visit:new')
    expect(draftKey('visit', undefined, 'event1')).toBe('sumai-draft:visit:new:event1')
  })
})

describe('serializeDraft / parseDraft', () => {
  const now = 1_000_000_000_000
  it('書いたものを読める', () => {
    expect(parseDraft(serializeDraft({ a: 1 }, now), now + 1000)).toEqual({ a: 1 })
  })

  it('古い・壊れた・形の違う下書きは null', () => {
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
    // 文字列の下書き（コメント）も読める
    expect(parseDraft(serializeDraft('一言', now), now)).toBe('一言')
  })
})

describe('sameValues', () => {
  it('空文字・未定義・null を同じとみなす', () => {
    expect(sameValues({ a: '', b: null }, { a: null, b: undefined })).toBe(true)
    expect(sameValues({ a: 'x' }, { a: null })).toBe(false)
  })
})
