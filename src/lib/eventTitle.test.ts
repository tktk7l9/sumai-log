import { describe, expect, it } from 'vitest'

import { resolveEventTitle, suggestEventTitle } from './eventTitle'

describe('suggestEventTitle', () => {
  it('names the vendor and the kind of event', () => {
    expect(suggestEventTitle({ kindLabel: '見学', vendorName: 'テスト工務店' })).toBe(
      'テスト工務店 見学',
    )
  })

  it('uses the property, then the place, when there is no vendor', () => {
    expect(suggestEventTitle({ kindLabel: '内覧', propertyName: 'テスト101' })).toBe(
      'テスト101 内覧',
    )
    expect(suggestEventTitle({ kindLabel: '見学', placeName: 'テスト展示場' })).toBe(
      'テスト展示場 見学',
    )
  })

  it('drops 「その他」 (other) instead of writing it into the title', () => {
    expect(suggestEventTitle({ kindLabel: 'その他', vendorName: 'テスト工務店' })).toBe(
      'テスト工務店',
    )
  })

  it('returns an empty string when nothing is chosen (the user has to type a title)', () => {
    expect(suggestEventTitle({ kindLabel: '見学' })).toBe('')
  })
})

describe('resolveEventTitle', () => {
  it('keeps what the user typed (trimmed)', () => {
    expect(resolveEventTitle('  打合せ 2回目 ', 'テスト工務店 打合せ')).toBe('打合せ 2回目')
  })

  it('falls back to the suggestion when the title is left empty', () => {
    expect(resolveEventTitle('  ', 'テスト工務店 見学')).toBe('テスト工務店 見学')
  })
})
